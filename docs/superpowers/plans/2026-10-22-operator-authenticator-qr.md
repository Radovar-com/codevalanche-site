# Operator authenticator setup repair

The operator flow currently discards the provider QR image and exposes the key as an unlabelled paragraph. Essential instructions disappear with a toast. Repair this within the existing account design.

- Keep the classified operator context, primary proof, credential stamp, fresh sign-in, role/MFA checks and global account-v1 configuration.
- Show the provider QR on a white scannable surface, two explicit steps and a labelled six-digit input. Keep the manual key inside a collapsed alternative.
- Distinguish new setup from verification of an existing factor; clear QR/key/input on cancellation, success, logout and identity changes.
- A user-initiated new setup replaces only unfinished TOTP factors carrying this UI's friendly name. Preserve verified factors and unrelated pending factors; refuse on cleanup failure.
- Preserve request-generation fencing during cleanup and enrollment. Never reuse a late response after logout/account change.
- Translate new visible copy in all existing site languages.

Verification: reproduce missing QR with the actual SDK browser harness, add pending-cleanup and stale-response regressions, assert the image decodes, inspect synthetic light/dark/mobile screenshots, run account security and locale checks, then independent review and required GitHub checks. Production publication needs the owner's concrete approval after review. Personal enrollment/verification remains a human action; never inspect or capture real setup secrets.
