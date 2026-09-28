import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  emptyAdvancedOptions,
  type AuthMechanism,
  type ConnectionAdvancedOptions,
} from "@/types/connection";
import { DATA_FIELD, numberOrNull, type ConnectionSectionProps } from "./connectionFormTypes";
import { Field } from "./Field";
import { FieldRow } from "./FieldRow";
import { SwitchField } from "./SwitchField";

const NEGOTIATE = "auto";

type NumberKey = "connectTimeoutMs" | "serverSelectionTimeoutMs" | "maxPoolSize" | "minPoolSize";
type TextKey = "appName" | "replicaSet" | "authSource";

export function AdvancedSection({ input, update }: ConnectionSectionProps) {
  const advanced = input.advanced;
  const set = (patch: Partial<ConnectionAdvancedOptions>) =>
    update("advanced", { ...advanced, ...patch });

  const text = (key: TextKey, id: string, label: string, placeholder?: string) => (
    <Field label={label} htmlFor={id}>
      <Input
        id={id}
        className={DATA_FIELD}
        spellCheck={false}
        value={advanced[key] ?? ""}
        onChange={(e) => set({ [key]: e.target.value || null })}
        placeholder={placeholder}
      />
    </Field>
  );
  const number = (key: NumberKey, id: string, label: string, placeholder?: string) => (
    <Field label={label} htmlFor={id}>
      <Input
        id={id}
        className={DATA_FIELD}
        type="number"
        min={0}
        value={advanced[key] ?? ""}
        onChange={(e) => set({ [key]: numberOrNull(e.target.value) })}
        placeholder={placeholder}
      />
    </Field>
  );

  return (
    <>
      <FieldRow>
        <Field label="Auth mechanism" htmlFor="adv-mechanism">
          <Select
            value={advanced.authMechanism ?? NEGOTIATE}
            onValueChange={(v) =>
              set({ authMechanism: v === NEGOTIATE ? null : (v as AuthMechanism) })
            }
          >
            <SelectTrigger id="adv-mechanism" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NEGOTIATE}>Negotiate automatically</SelectItem>
              <SelectItem value="SCRAM_SHA1">SCRAM-SHA-1</SelectItem>
              <SelectItem value="SCRAM_SHA256">SCRAM-SHA-256</SelectItem>
              <SelectItem value="MONGODB_X509">X.509</SelectItem>
              <SelectItem value="MONGODB_AWS">MONGODB-AWS (IAM)</SelectItem>
              <SelectItem value="GSSAPI">Kerberos (GSSAPI, requires special build)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {text("authSource", "adv-auth-source", "Auth source", "e.g. admin")}
      </FieldRow>
      <FieldRow>
        {text("replicaSet", "adv-replica-set", "Replica set", "Optional")}
        {number("maxPoolSize", "adv-max-pool", "Max pool size", "1")}
      </FieldRow>
      <FieldRow>
        {number("serverSelectionTimeoutMs", "adv-sst", "Server selection timeout (ms)", "Driver default")}
        {number("connectTimeoutMs", "adv-cto", "Connect timeout (ms)", "Driver default")}
      </FieldRow>
      <FieldRow>
        {text("appName", "adv-app-name", "App name", "mongo-studio")}
        {number("minPoolSize", "adv-min-pool", "Min pool size", "1")}
      </FieldRow>
      <SwitchField
        label="Direct connection"
        description="Talk to this host only, without discovering the rest of the replica set."
        checked={advanced.directConnection ?? false}
        onCheckedChange={(directConnection) => set({ directConnection })}
      />
      <SwitchField
        label="Retry writes"
        description="Retry a write once after a transient network error or failover."
        checked={advanced.retryWrites ?? true}
        onCheckedChange={(retryWrites) => set({ retryWrites })}
      />
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => update("advanced", emptyAdvancedOptions())}
      >
        <RotateCcw />
        Reset advanced options
      </Button>
    </>
  );
}
