/** What the script printed with console.log(...), one row per call. */
export function ConsoleLogs({ logs }: { logs: string[] }) {
  if (logs.length === 0) {
    return (
      <p className="grid flex-1 place-items-center p-6 text-center text-fg-3">
        Nothing logged. Output from console.log(...) shows here.
      </p>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-auto py-2 font-data">
      {logs.map((line, i) => (
        <div key={i} className="px-3.5 py-px whitespace-pre-wrap break-words text-fg">
          {line}
        </div>
      ))}
    </div>
  );
}
