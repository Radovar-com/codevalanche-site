for (const button of document.querySelectorAll('[data-copy-command]')) {
  const command = document.getElementById(button.dataset.copyCommand);
  if (!command || !navigator.clipboard?.writeText) continue;
  button.hidden = false;
  button.addEventListener('click', async () => {
    const card = button.closest('.verify-release');
    for (const status of card.querySelectorAll('[data-copy-ok], [data-copy-failed]')) status.hidden = true;
    try {
      await navigator.clipboard.writeText(command.textContent);
      card.querySelector('[data-copy-ok]').hidden = false;
    } catch {
      card.querySelector('[data-copy-failed]').hidden = false;
    }
  });
}
