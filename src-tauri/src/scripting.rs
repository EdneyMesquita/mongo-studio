use std::cell::RefCell;
use std::rc::Rc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use mongodb::Client;
use rquickjs::function::{Async, Rest};
use rquickjs::{Array, AsyncContext, AsyncRuntime, Ctx, Function, Object, Type, Value};
use serde_json::Value as JsonValue;

use crate::driver;
use crate::error::{AppError, AppResult};
use crate::models::FindQueryInput;

/// Scripts run until they finish or this timeout elapses, whichever comes
/// first. 60s comfortably covers slow aggregations without letting a runaway
/// `while(true){}` hang the app indefinitely.
const DEFAULT_TIMEOUT_MS: u64 = 60_000;

const PRELUDE: &str = r#"
globalThis.db = {
    getCollection: function(name) {
        return {
            find: function(filter, options) {
                return __native_find(name, filter || {}, options || {});
            },
            findOne: function(filter) {
                return __native_find_one(name, filter || {});
            },
            insertOne: function(doc) {
                return __native_insert_one(name, doc);
            },
            updateOne: function(filter, update) {
                return __native_update_one(name, filter, update);
            },
            deleteOne: function(filter) {
                return __native_delete_one(name, filter);
            },
            aggregate: function(pipeline) {
                return __native_aggregate(name, pipeline || []);
            },
            countDocuments: function(filter) {
                return __native_count(name, filter || {});
            },
        };
    },
    collection: function(name) {
        return this.getCollection(name);
    },
};
globalThis.print = function(...args) { console.log(...args); };
globalThis.ObjectId = function(hex) { return { $oid: hex }; };
globalThis.ISODate = function(str) { return { $date: str }; };
"#;

#[derive(Debug)]
pub struct ScriptExecutionResult {
    pub value: JsonValue,
    pub logs: Vec<String>,
}

/// Runs `script` against `database` on a dedicated OS thread so the
/// single-threaded QuickJS runtime (its types aren't `Send`) never has to
/// cross into Tauri's command-dispatch future, which must be `Send`. The
/// dedicated thread reuses the *same* Tokio runtime handle as the rest of
/// the app (via `Handle::block_on`, not a brand new `Runtime`) so the
/// `mongodb::Client`'s pooled connections - registered with the main
/// runtime's I/O reactor - stay usable; a second independent runtime here
/// would panic the first time a socket read/write crossed reactors.
pub async fn run_script(
    client: Client,
    database: String,
    script: String,
    timeout_ms: Option<u64>,
    cancel_flag: Arc<AtomicBool>,
    on_log: impl Fn(String) + Send + 'static,
) -> AppResult<ScriptExecutionResult> {
    let timeout_ms = timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS);
    let watchdog_flag = cancel_flag.clone();
    let watchdog = tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(timeout_ms)).await;
        watchdog_flag.store(true, Ordering::Relaxed);
    });

    let handle = tokio::runtime::Handle::current();
    let (tx, rx) = tokio::sync::oneshot::channel();
    std::thread::spawn(move || {
        let outcome = handle.block_on(execute(client, database, script, cancel_flag, on_log));
        let _ = tx.send(outcome);
    });

    let outcome = rx
        .await
        .map_err(|_| AppError::InvalidInput("script execution thread panicked".to_string()))?;
    watchdog.abort();
    outcome
}

async fn execute(
    client: Client,
    database: String,
    script: String,
    interrupt_flag: Arc<AtomicBool>,
    on_log: impl Fn(String) + Send + 'static,
) -> AppResult<ScriptExecutionResult> {
    let js_rt = AsyncRuntime::new().map_err(|e| AppError::InvalidInput(e.to_string()))?;
    js_rt
        .set_interrupt_handler(Some(Box::new(move || {
            interrupt_flag.load(Ordering::Relaxed)
        })))
        .await;
    let ctx = AsyncContext::full(&js_rt)
        .await
        .map_err(|e| AppError::InvalidInput(e.to_string()))?;

    let logs = Rc::new(RefCell::new(Vec::<String>::new()));

    let outcome: Result<JsonValue, String> = ctx
        .async_with(async |ctx| {
            install_globals(&ctx, client, database, logs.clone(), on_log)
                .map_err(|e| describe_js_error(&ctx, e))?;
            let promise = ctx
                .eval_promise(script)
                .map_err(|e| describe_js_error(&ctx, e))?;
            let value: Value = promise
                .into_future()
                .await
                .map_err(|e| describe_js_error(&ctx, e))?;
            // `eval_promise` runs the script as an async function body (to
            // support top-level await), and QuickJS wraps that completion
            // value the same way an async function's return value is
            // wrapped: as `{ value: <result> }` rather than the bare value.
            let unwrapped = match value.as_object() {
                Some(obj) if obj.contains_key("value").unwrap_or(false) => {
                    obj.get::<_, Value>("value").unwrap_or(value.clone())
                }
                _ => value,
            };
            js_to_json(&unwrapped).map_err(|e| describe_js_error(&ctx, e))
        })
        .await;

    match outcome {
        Ok(value) => Ok(ScriptExecutionResult {
            value,
            logs: logs.borrow().clone(),
        }),
        Err(message) => Err(AppError::InvalidInput(message)),
    }
}

fn describe_js_error(ctx: &Ctx<'_>, err: rquickjs::Error) -> String {
    if err.is_exception() {
        if let Some(ex) = ctx.catch().into_object() {
            if let Ok(message) = ex.get::<_, rquickjs::String>("message") {
                if let Ok(s) = message.to_string() {
                    return s;
                }
            }
            if let Ok(json) = js_to_json(ex.as_value()) {
                return json.to_string();
            }
        }
    }
    err.to_string()
}

fn app_err_to_js<'js>(ctx: &Ctx<'js>, err: AppError) -> rquickjs::Error {
    let message = err.to_string();
    let value = rquickjs::String::from_str(ctx.clone(), &message)
        .map(|s| s.into_value())
        .unwrap_or_else(|_| Value::new_undefined(ctx.clone()));
    ctx.throw(value)
}

fn install_globals<'js>(
    ctx: &Ctx<'js>,
    client: Client,
    database: String,
    logs: Rc<RefCell<Vec<String>>>,
    on_log: impl Fn(String) + 'js,
) -> rquickjs::Result<()> {
    let globals = ctx.globals();

    let console = Object::new(ctx.clone())?;
    let logs_for_log = logs.clone();
    console.set(
        "log",
        Function::new(ctx.clone(), move |args: Rest<Value<'_>>| {
            let message = args
                .0
                .iter()
                .map(format_js_value)
                .collect::<Vec<_>>()
                .join(" ");
            logs_for_log.borrow_mut().push(message.clone());
            on_log(message);
        }),
    )?;
    globals.set("console", console)?;

    let find_client = client.clone();
    let find_database = database.clone();
    globals.set(
        "__native_find",
        Function::new(
            ctx.clone(),
            Async(
                move |ctx: Ctx<'js>, coll: String, filter: Value<'js>, options: Value<'js>| {
                    let client = find_client.clone();
                    let database = find_database.clone();
                    async move {
                        let filter_json =
                            js_to_json(&filter).map_err(|e| app_err_to_js(&ctx, invalid(e)))?;
                        let options_json =
                            js_to_json(&options).map_err(|e| app_err_to_js(&ctx, invalid(e)))?;
                        let query = find_query_from_json(filter_json, options_json)
                            .map_err(|e| app_err_to_js(&ctx, e))?;
                        let page = driver::run_find(&client, &database, &coll, &query)
                            .await
                            .map_err(|e| app_err_to_js(&ctx, e))?;
                        json_to_js(&ctx, &JsonValue::Array(page.documents))
                    }
                },
            ),
        )?,
    )?;

    let find_one_client = client.clone();
    let find_one_database = database.clone();
    globals.set(
        "__native_find_one",
        Function::new(
            ctx.clone(),
            Async(move |ctx: Ctx<'js>, coll: String, filter: Value<'js>| {
                let client = find_one_client.clone();
                let database = find_one_database.clone();
                async move {
                    let filter_json =
                        js_to_json(&filter).map_err(|e| app_err_to_js(&ctx, invalid(e)))?;
                    let query = FindQueryInput {
                        filter: filter_json,
                        sort: None,
                        projection: None,
                        limit: Some(1),
                        skip: None,
                    };
                    let page = driver::run_find(&client, &database, &coll, &query)
                        .await
                        .map_err(|e| app_err_to_js(&ctx, e))?;
                    let first = page.documents.into_iter().next().unwrap_or(JsonValue::Null);
                    json_to_js(&ctx, &first)
                }
            }),
        )?,
    )?;

    let insert_client = client.clone();
    let insert_database = database.clone();
    globals.set(
        "__native_insert_one",
        Function::new(
            ctx.clone(),
            Async(move |ctx: Ctx<'js>, coll: String, document: Value<'js>| {
                let client = insert_client.clone();
                let database = insert_database.clone();
                async move {
                    let document_json =
                        js_to_json(&document).map_err(|e| app_err_to_js(&ctx, invalid(e)))?;
                    let result = driver::insert_one(&client, &database, &coll, document_json)
                        .await
                        .map_err(|e| app_err_to_js(&ctx, e))?;
                    json_to_js(&ctx, &serde_json::json!({ "insertedId": result }))
                }
            }),
        )?,
    )?;

    let update_client = client.clone();
    let update_database = database.clone();
    globals.set(
        "__native_update_one",
        Function::new(
            ctx.clone(),
            Async(
                move |ctx: Ctx<'js>, coll: String, filter: Value<'js>, update: Value<'js>| {
                    let client = update_client.clone();
                    let database = update_database.clone();
                    async move {
                        let filter_json =
                            js_to_json(&filter).map_err(|e| app_err_to_js(&ctx, invalid(e)))?;
                        let update_json =
                            js_to_json(&update).map_err(|e| app_err_to_js(&ctx, invalid(e)))?;
                        let result =
                            driver::update_one(&client, &database, &coll, filter_json, update_json)
                                .await
                                .map_err(|e| app_err_to_js(&ctx, e))?;
                        json_to_js(&ctx, &result)
                    }
                },
            ),
        )?,
    )?;

    let delete_client = client.clone();
    let delete_database = database.clone();
    globals.set(
        "__native_delete_one",
        Function::new(
            ctx.clone(),
            Async(move |ctx: Ctx<'js>, coll: String, filter: Value<'js>| {
                let client = delete_client.clone();
                let database = delete_database.clone();
                async move {
                    let filter_json =
                        js_to_json(&filter).map_err(|e| app_err_to_js(&ctx, invalid(e)))?;
                    let result = driver::delete_one(&client, &database, &coll, filter_json)
                        .await
                        .map_err(|e| app_err_to_js(&ctx, e))?;
                    json_to_js(&ctx, &result)
                }
            }),
        )?,
    )?;

    let aggregate_client = client.clone();
    let aggregate_database = database.clone();
    globals.set(
        "__native_aggregate",
        Function::new(
            ctx.clone(),
            Async(move |ctx: Ctx<'js>, coll: String, pipeline: Value<'js>| {
                let client = aggregate_client.clone();
                let database = aggregate_database.clone();
                async move {
                    let pipeline_json =
                        js_to_json(&pipeline).map_err(|e| app_err_to_js(&ctx, invalid(e)))?;
                    let page = driver::run_aggregate(&client, &database, &coll, pipeline_json)
                        .await
                        .map_err(|e| app_err_to_js(&ctx, e))?;
                    json_to_js(&ctx, &JsonValue::Array(page.documents))
                }
            }),
        )?,
    )?;

    let count_client = client.clone();
    let count_database = database.clone();
    globals.set(
        "__native_count",
        Function::new(
            ctx.clone(),
            Async(move |ctx: Ctx<'js>, coll: String, filter: Value<'js>| {
                let client = count_client.clone();
                let database = count_database.clone();
                async move {
                    let filter_json =
                        js_to_json(&filter).map_err(|e| app_err_to_js(&ctx, invalid(e)))?;
                    let count = driver::count_documents(&client, &database, &coll, filter_json)
                        .await
                        .map_err(|e| app_err_to_js(&ctx, e))?;
                    json_to_js(&ctx, &JsonValue::from(count))
                }
            }),
        )?,
    )?;

    ctx.eval_promise(PRELUDE)?;
    Ok(())
}

fn invalid(err: rquickjs::Error) -> AppError {
    AppError::InvalidInput(err.to_string())
}

fn find_query_from_json(filter: JsonValue, options: JsonValue) -> AppResult<FindQueryInput> {
    let obj = options.as_object();
    Ok(FindQueryInput {
        filter,
        sort: obj.and_then(|o| o.get("sort")).cloned(),
        projection: obj.and_then(|o| o.get("projection")).cloned(),
        limit: obj
            .and_then(|o| o.get("limit"))
            .and_then(|v| v.as_i64())
            .or(Some(1000)),
        skip: obj.and_then(|o| o.get("skip")).and_then(|v| v.as_u64()),
    })
}

fn format_js_value(value: &Value<'_>) -> String {
    if let Some(s) = value.as_string() {
        return s.to_string().unwrap_or_default();
    }
    match js_to_json(value) {
        Ok(json) => serde_json::to_string(&json).unwrap_or_else(|_| "null".to_string()),
        Err(_) => "<unrepresentable value>".to_string(),
    }
}

fn js_to_json(value: &Value<'_>) -> rquickjs::Result<JsonValue> {
    match value.type_of() {
        Type::Uninitialized | Type::Undefined | Type::Null => Ok(JsonValue::Null),
        Type::Bool => Ok(JsonValue::Bool(value.as_bool().unwrap_or(false))),
        Type::Int => Ok(JsonValue::from(value.as_int().unwrap_or(0))),
        Type::Float => Ok(
            serde_json::Number::from_f64(value.as_float().unwrap_or(0.0))
                .map(JsonValue::Number)
                .unwrap_or(JsonValue::Null),
        ),
        Type::String => {
            let s = value.as_string().unwrap();
            Ok(JsonValue::String(s.to_string()?))
        }
        Type::Array => {
            let arr = value.as_array().unwrap();
            let mut out = Vec::with_capacity(arr.len());
            for item in arr.iter::<Value>() {
                out.push(js_to_json(&item?)?);
            }
            Ok(JsonValue::Array(out))
        }
        Type::Object | Type::Exception | Type::Proxy => {
            let obj = value.as_object().unwrap();
            let mut map = serde_json::Map::new();
            for prop in obj.props::<std::string::String, Value>() {
                let (k, v) = prop?;
                map.insert(k, js_to_json(&v)?);
            }
            Ok(JsonValue::Object(map))
        }
        // Functions, symbols, promises, etc. have no JSON representation.
        _ => Ok(JsonValue::Null),
    }
}

fn json_to_js<'js>(ctx: &Ctx<'js>, value: &JsonValue) -> rquickjs::Result<Value<'js>> {
    match value {
        JsonValue::Null => Ok(Value::new_null(ctx.clone())),
        JsonValue::Bool(b) => Ok(Value::new_bool(ctx.clone(), *b)),
        JsonValue::Number(n) => {
            if let Some(i) = n.as_i64() {
                if let Ok(i32_val) = i32::try_from(i) {
                    return Ok(Value::new_int(ctx.clone(), i32_val));
                }
            }
            Ok(Value::new_float(ctx.clone(), n.as_f64().unwrap_or(0.0)))
        }
        JsonValue::String(s) => Ok(rquickjs::String::from_str(ctx.clone(), s)?.into_value()),
        JsonValue::Array(items) => {
            let arr = Array::new(ctx.clone())?;
            for (i, item) in items.iter().enumerate() {
                arr.set(i, json_to_js(ctx, item)?)?;
            }
            Ok(arr.into_value())
        }
        JsonValue::Object(map) => {
            let obj = Object::new(ctx.clone())?;
            for (k, v) in map {
                obj.set(k.as_str(), json_to_js(ctx, v)?)?;
            }
            Ok(obj.into_value())
        }
    }
}

#[cfg(test)]
mod live_tests {
    use super::*;
    use crate::connection::extract_uri_credentials;
    use crate::models::{
        ConnectionAdvancedOptions, ConnectionProfile, ConnectionSource, TlsOptions,
    };
    use crate::secrets::{InMemoryStore, SecretKind, SecretStore};
    use crate::ssh_tunnel::KnownHosts;
    use std::sync::Mutex;

    /// Connects to the live MongoDB instance named by `MONGO_STUDIO_TEST_URI`
    /// (see driver.rs's live_tests for the same pattern) and returns the
    /// client plus the database name from the URI path, if any.
    async fn live_client() -> (Client, String) {
        let uri = std::env::var("MONGO_STUDIO_TEST_URI")
            .expect("set MONGO_STUDIO_TEST_URI to run this test");
        let (stripped_uri, username, password) = extract_uri_credentials(&uri);
        let database = stripped_uri
            .rsplit('/')
            .next()
            .and_then(|tail| tail.split('?').next())
            .filter(|s| !s.is_empty())
            .unwrap_or("test")
            .to_string();

        let secrets = InMemoryStore::new();
        let profile_id = "live-script-test".to_string();
        if let Some(password) = &password {
            secrets
                .set(&profile_id, SecretKind::Password, password)
                .unwrap();
        }
        let profile = ConnectionProfile {
            id: profile_id,
            name: "live script test".to_string(),
            source: ConnectionSource::Uri { uri: stripped_uri },
            database: None,
            username,
            has_password: password.is_some(),
            tls: TlsOptions::default(),
            ssh_tunnel: None,
            advanced: ConnectionAdvancedOptions::default(),
            created_at: String::new(),
            updated_at: String::new(),
        };
        let known_hosts = Arc::new(
            KnownHosts::load(&std::env::temp_dir().join("mongo-studio-script-test")).unwrap(),
        );
        let active = crate::driver::connect(&profile, &secrets, &known_hosts)
            .await
            .expect("connect should succeed");
        (active.client, database)
    }

    fn noop_log() -> impl Fn(String) + Send + 'static {
        |_| {}
    }

    #[tokio::test]
    #[ignore]
    async fn live_script_basic_expression() {
        let (client, database) = live_client().await;
        let result = run_script(
            client,
            database,
            "1 + 1".to_string(),
            Some(5_000),
            Arc::new(AtomicBool::new(false)),
            noop_log(),
        )
        .await
        .unwrap();
        assert_eq!(result.value, JsonValue::from(2));
    }

    #[tokio::test]
    #[ignore]
    async fn live_script_console_log_is_captured() {
        let (client, database) = live_client().await;
        let logs = Arc::new(Mutex::new(Vec::<String>::new()));
        let logs_for_cb = logs.clone();
        let result = run_script(
            client,
            database,
            "console.log('hello', 42); 'done'".to_string(),
            Some(5_000),
            Arc::new(AtomicBool::new(false)),
            move |m| logs_for_cb.lock().unwrap().push(m),
        )
        .await
        .unwrap();
        assert_eq!(result.value, JsonValue::String("done".to_string()));
        assert_eq!(result.logs, vec!["hello 42".to_string()]);
        assert_eq!(logs.lock().unwrap().clone(), vec!["hello 42".to_string()]);
    }

    #[tokio::test]
    #[ignore]
    async fn live_script_can_query_a_collection() {
        let (client, database) = live_client().await;
        let dbs = crate::driver::list_databases(&client).await.unwrap();
        let db_name = dbs
            .iter()
            .find(|d| d.name == database)
            .map(|d| d.name.clone())
            .unwrap_or(database);
        let collections = crate::driver::list_collections(&client, &db_name)
            .await
            .unwrap();
        let Some(collection) = collections.first() else {
            println!("database {db_name} has no collections, skipping");
            return;
        };
        let script = format!(
            "await db.collection(\"{}\").countDocuments({{}})",
            collection.name
        );
        let result = run_script(
            client,
            db_name,
            script,
            Some(10_000),
            Arc::new(AtomicBool::new(false)),
            noop_log(),
        )
        .await
        .unwrap();
        assert!(result.value.is_number());
    }

    #[tokio::test]
    #[ignore]
    async fn live_script_thrown_error_is_reported() {
        let (client, database) = live_client().await;
        let err = run_script(
            client,
            database,
            "throw new Error('boom')".to_string(),
            Some(5_000),
            Arc::new(AtomicBool::new(false)),
            noop_log(),
        )
        .await
        .unwrap_err();
        assert!(err.to_string().contains("boom"), "unexpected error: {err}");
    }

    #[tokio::test]
    #[ignore]
    async fn live_script_timeout_kills_infinite_loop() {
        let (client, database) = live_client().await;
        let started = std::time::Instant::now();
        let err = run_script(
            client,
            database,
            "while (true) {}".to_string(),
            Some(300),
            Arc::new(AtomicBool::new(false)),
            noop_log(),
        )
        .await
        .unwrap_err();
        assert!(
            started.elapsed() < Duration::from_secs(5),
            "timeout took too long to take effect"
        );
        println!("timeout error: {err}");
    }
}
