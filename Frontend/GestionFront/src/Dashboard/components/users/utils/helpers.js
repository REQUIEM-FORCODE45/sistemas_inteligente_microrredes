/**
 * Cifra un string con SHA-256 usando la Web Crypto API nativa del navegador.
 */
export async function sha256(message) {
    const buffer = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(message),
    );
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Genera las iniciales de un nombre completo (máx. 2 letras).
 */
export function getInitials(name) {
    return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

/**
 * Clase base para inputs de texto / password.
 */
export const inputClass = (hasError) =>
    `w-full bg-white border rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300
   focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400
   ${hasError ? 'border-red-400' : 'border-slate-200'}`;
