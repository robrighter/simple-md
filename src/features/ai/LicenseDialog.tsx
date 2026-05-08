type LicenseDialogProps = {
  onAccept: () => void
  onCancel: () => void
}

export function LicenseDialog({ onAccept, onCancel }: LicenseDialogProps) {
  return (
    <div className="ai-modal" role="dialog" aria-modal="true" aria-labelledby="ai-license-title">
      <div className="ai-modal__panel">
        <h2 id="ai-license-title">Gemma terms of use</h2>
        <p>
          Gemma models are released by Google under the{' '}
          <a
            href="https://ai.google.dev/gemma/terms"
            target="_blank"
            rel="noreferrer noopener"
          >
            Gemma Terms of Use
          </a>
          . Downloading and running Gemma 4 from this app means agreeing to those terms,
          including the prohibited-use policy.
        </p>
        <p>
          The model runs entirely on this machine. Nothing leaves the device unless you
          choose to copy something out of the chat.
        </p>
        <div className="ai-modal__actions">
          <button type="button" className="ghost-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="ai-button ai-button--primary" onClick={onAccept}>
            I accept
          </button>
        </div>
      </div>
    </div>
  )
}
