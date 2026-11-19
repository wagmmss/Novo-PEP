export async function copyToClipboard(text: string): Promise<boolean> {
  const payload = String(text ?? '');
  if (!payload) return false;

  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(payload);
      return true;
    }
  } catch {
    // Fallback para contextos de iframe com restrição de Clipboard API
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = payload;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
