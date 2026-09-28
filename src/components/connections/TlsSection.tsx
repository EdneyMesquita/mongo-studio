import { Input } from "@/components/ui/input";
import { KEEP_SAVED, type ConnectionSectionProps } from "./connectionFormTypes";
import { Field } from "./Field";
import { FilePicker } from "./FilePicker";
import { SwitchField } from "./SwitchField";

export function TlsSection({ input, update, editing }: ConnectionSectionProps) {
  const tls = input.tls;
  return (
    <>
      <SwitchField
        label="Use TLS"
        description="Required by most hosted clusters; mongodb+srv turns it on by default."
        checked={tls.enabled}
        onCheckedChange={(enabled) => update("tls", { ...tls, enabled })}
      />
      <Field label="Certificate authority" htmlFor="tls-ca">
        <FilePicker
          id="tls-ca"
          value={tls.caFile}
          onChange={(caFile) => update("tls", { ...tls, caFile })}
          placeholder="System trust store"
        />
      </Field>
      <Field
        label="Client certificate and key"
        htmlFor="tls-cert"
        help="PEM file with both the certificate and the private key."
      >
        <FilePicker
          id="tls-cert"
          value={tls.certKeyFile}
          onChange={(certKeyFile) => update("tls", { ...tls, certKeyFile })}
          placeholder="None"
        />
      </Field>
      <Field label="Key passphrase" htmlFor="tls-passphrase">
        <Input
          id="tls-passphrase"
          type="password"
          autoComplete="new-password"
          value={input.tlsCertKeyPassphrase ?? ""}
          onChange={(e) => update("tlsCertKeyPassphrase", e.target.value || null)}
          placeholder={editing?.tls.certKeyHasPassphrase ? KEEP_SAVED : "Optional"}
        />
      </Field>
      <SwitchField
        label="Allow invalid certificates"
        description="Skips the certificate check. For testing only, never for production."
        checked={tls.allowInvalidCertificates}
        onCheckedChange={(allowInvalidCertificates) =>
          update("tls", { ...tls, allowInvalidCertificates })
        }
      />
    </>
  );
}
