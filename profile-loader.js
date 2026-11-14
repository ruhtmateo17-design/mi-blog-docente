/**
 * profile-loader.js — Carga dinámica del perfil docente desde IndexedDB.
 * Incluir DESPUÉS de db.js en cada página.
 *
 * Uso: await window.applyTeacherProfile()
 *   — o se ejecuta automáticamente al cargar si el body tiene data-auto-profile
 *
 * Los elementos usan atributos data-tp="campo" para ser actualizados:
 *   data-tp="name"         → nombre completo
 *   data-tp="title"        → título académico (Lic., Dr., etc.)
 *   data-tp="role"         → rol / cargo
 *   data-tp="specialty"    → área de especialidad
 *   data-tp="school"       → escuela / distrito
 *   data-tp="years"        → años de experiencia
 *   data-tp="bio"          → frase pedagógica
 *   data-tp="photo"        → src de la foto (en <img>)
 *   data-tp="photo-alt"    → alt text con el nombre
 *   data-tp="greeting"     → saludo: "¡Buen día, [Título] [Nombre]!"
 *   data-tp="titleName"    → "Título Nombre" combinado
 *   data-tp="schoolYears"  → "Escuela • N años de experiencia"
 */
(function() {
  'use strict';

  /* ───────────────────────── Estilo 3D (barras y botones) ───────────────────────── */
  const CSS_3D = `
  /* Botones con acción: relieve 3D que se hunde al presionar */
  button:not(.no-3d):not([disabled]),
  main a.shrink-0,
  header a.w-11,
  header button {
    background-image: linear-gradient(180deg, rgba(255,255,255,.28) 0%, rgba(255,255,255,0) 55%, rgba(0,0,0,.10) 100%) !important;
    border: 1px solid rgba(255,255,255,.35) !important;
    box-shadow:
      0 4px 0 rgba(0,0,0,.28),
      0 8px 14px rgba(15,32,66,.22),
      inset 0 1px 0 rgba(255,255,255,.55) !important;
    transform: translateY(0) !important;
    transition: transform .08s ease, box-shadow .08s ease, filter .15s ease !important;
  }
  button:not(.no-3d):not([disabled]):hover,
  main a.shrink-0:hover,
  header a.w-11:hover,
  header button:hover {
    filter: brightness(1.06);
    transform: translateY(-1px) !important;
  }
  button:not(.no-3d):not([disabled]):active,
  main a.shrink-0:active,
  header a.w-11:active,
  header button:active {
    transform: translateY(3px) !important;
    box-shadow:
      0 1px 0 rgba(0,0,0,.28),
      0 2px 5px rgba(15,32,66,.20),
      inset 0 2px 4px rgba(0,0,0,.20) !important;
  }

  /* Barra superior */
  header.fixed {
    background-image: linear-gradient(180deg, rgba(255,255,255,.95), rgba(226,231,238,.92)) !important;
    border-bottom: 1px solid rgba(255,255,255,.9);
    box-shadow:
      0 5px 0 rgba(15,32,66,.10),
      0 10px 22px rgba(15,32,66,.18),
      inset 0 -1px 0 rgba(15,32,66,.10) !important;
  }

  /* Barra de navegación inferior */
  nav.fixed {
    background-image: linear-gradient(180deg, rgba(255,255,255,.98), rgba(222,228,236,.95)) !important;
    border-top: 1px solid rgba(255,255,255,.95);
    box-shadow:
      0 -5px 0 rgba(15,32,66,.08),
      0 -10px 22px rgba(15,32,66,.18),
      inset 0 1px 0 #fff !important;
  }
  /* Cada botón de la barra como una tecla en relieve */
  nav.fixed a {
    border-radius: 14px !important;
    background-image: linear-gradient(180deg, #ffffff 0%, #e9edf3 100%) !important;
    box-shadow:
      0 3px 0 #bcc4d0,
      0 6px 10px rgba(15,32,66,.18),
      inset 0 1px 0 #fff !important;
    transform: translateY(-2px);
    transition: transform .08s ease, box-shadow .08s ease !important;
  }
  nav.fixed a:active,
  nav.fixed a.text-secondary,
  nav.fixed a.text-primary {
    /* pestaña activa: se ve presionada */
    background-image: linear-gradient(180deg, #d6e4f0 0%, #eaf2f9 100%) !important;
    transform: translateY(1px) !important;
    box-shadow:
      0 0 0 #bcc4d0,
      inset 0 3px 6px rgba(15,32,66,.25) !important;
  }
  /* Botón central (editor) con volumen */
  nav.fixed a > div.rounded-full {
    background-image: radial-gradient(circle at 30% 25%, rgba(255,255,255,.45), rgba(255,255,255,0) 60%) !important;
    box-shadow: 0 3px 0 rgba(0,0,0,.35), 0 6px 10px rgba(15,32,66,.35), inset 0 1px 0 rgba(255,255,255,.5) !important;
  }
  `;

  function inject3D() {
    if (document.getElementById('aula-3d-style')) return;
    const st = document.createElement('style');
    st.id = 'aula-3d-style';
    st.textContent = CSS_3D;
    document.head.appendChild(st);
  }
  inject3D();

  /* ───────────────────────── Perfil ───────────────────────── */

  // Avatar genérico de respaldo (se usa solo si la foto no carga)
  const FALLBACK_PHOTO = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="%236750A4" rx="60"/><text x="60" y="72" text-anchor="middle" font-size="48" font-family="sans-serif" fill="white">👩‍🏫</text></svg>');

  // Foto por defecto: archivo foto-perfil.jpg en la raíz del repositorio
  const DEFAULT_PHOTO = 'foto-perfil.jpg';

  // Datos del perfil
  const OWNER_NAME  = 'Ruht Mateo';
  const OWNER_TITLE = 'Lic.';

  let cachedProfile = null;

  async function getProfile() {
    if (cachedProfile) return cachedProfile;
    const db = window.AulaAbiertaDB;
    if (!db) return null;
    try {
      let p = await db.getTeacherProfile();

      // Migración: reemplaza el nombre de ejemplo (Ramona Almonte) por el del docente real
      if (/ramona\s+almonte/i.test(p.name || '')) {
        p = await db.updateTeacherProfile({ name: OWNER_NAME, title: OWNER_TITLE });
      }
      // Evita "Lic. Lic. Nombre" si el nombre ya trae el título
      if (p.title && (p.name || '').toLowerCase().startsWith(p.title.toLowerCase())) {
        p = await db.updateTeacherProfile({ name: p.name.slice(p.title.length).trim() });
      }

      // Autor de los artículos de ejemplo
      try {
        const arts = await db.getAll('articles');
        for (const a of arts) {
          if (/ramona\s+almonte/i.test(a.author || '')) {
            a.author = OWNER_TITLE + ' ' + OWNER_NAME;
            await db.put('articles', a);
          }
        }
      } catch (e) { /* no es crítico */ }

      cachedProfile = p;
      return cachedProfile;
    } catch (e) {
      console.warn('[profile-loader] Error cargando perfil:', e);
      return null;
    }
  }

  function firstName(fullName) {
    // Extract first name after title: "Lic. Ruht Mateo" → "Ruht"
    const parts = fullName.trim().split(/\s+/);
    if (parts.length <= 1) return fullName;
    // Skip title-like prefixes
    const titles = ['lic.','mtr.','mtra.','dr.','dra.','ing.','prof.','tec.'];
    let start = 0;
    if (titles.includes(parts[0].toLowerCase())) start = 1;
    return parts[start] || fullName;
  }

  // Cambia el icono de persona del encabezado por la foto de perfil
  function installHeaderAvatar() {
    const box = document.querySelector('header .w-8.h-8.rounded-full.bg-primary');
    if (!box) return;
    const img = document.createElement('img');
    img.setAttribute('data-tp', 'photo');
    img.alt = 'Foto de perfil';
    img.className = 'w-10 h-10 rounded-full object-cover';
    img.style.boxShadow = '0 0 0 2px #fff, 0 3px 0 rgba(0,0,0,.25), 0 6px 10px rgba(15,32,66,.30)';
    box.replaceWith(img);
  }

  /* ───────────── Editor de nombre (lápiz junto al nombre) ───────────── */

  function openNameEditor() {
    const old = document.getElementById('aula-name-modal');
    if (old) old.remove();

    getProfile().then(p => {
      if (!p) return;
      const overlay = document.createElement('div');
      overlay.id = 'aula-name-modal';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:100;background:rgba(0,10,34,.55);display:flex;align-items:center;justify-content:center;padding:16px;';
      overlay.innerHTML = `
        <div style="background:#fff;border-radius:16px;width:100%;max-width:380px;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,.35);font-family:'Source Sans 3',sans-serif;color:#191c1e;max-height:90vh;overflow:auto;">
          <h3 style="margin:0 0 14px;font-size:20px;font-weight:700;">Editar nombre</h3>
          <label style="display:block;font-size:13px;font-weight:600;margin:10px 0 4px;">Título</label>
          <select id="nm-title" style="width:100%;padding:11px;border:1.5px solid #c5c6cf;border-radius:10px;font-size:15px;background:#fff;">
            <option value="">Sin título</option><option>Tec.</option><option>Lic.</option><option>Ing.</option>
            <option>Mtr.</option><option>Mtra.</option><option>Dr.</option><option>Dra.</option><option>Prof.</option>
          </select>
          <label style="display:block;font-size:13px;font-weight:600;margin:10px 0 4px;">Nombre</label>
          <input id="nm-name" type="text" maxlength="80" style="width:100%;box-sizing:border-box;padding:11px;border:1.5px solid #c5c6cf;border-radius:10px;font-size:15px;"/>
          <label style="display:block;font-size:13px;font-weight:600;margin:10px 0 4px;">Rol / Cargo</label>
          <input id="nm-role" type="text" maxlength="60" style="width:100%;box-sizing:border-box;padding:11px;border:1.5px solid #c5c6cf;border-radius:10px;font-size:15px;"/>
          <label style="display:block;font-size:13px;font-weight:600;margin:10px 0 4px;">Escuela / Distrito</label>
          <input id="nm-school" type="text" maxlength="100" style="width:100%;box-sizing:border-box;padding:11px;border:1.5px solid #c5c6cf;border-radius:10px;font-size:15px;"/>
          <div style="display:flex;gap:10px;margin-top:18px;">
            <button type="button" id="nm-cancel" style="flex:1;padding:12px;border-radius:12px;background-color:#e6e8ea;color:#45464e;font-weight:600;font-size:15px;cursor:pointer;">Cancelar</button>
            <button type="button" id="nm-save" style="flex:1;padding:12px;border-radius:12px;background-color:#0f2042;color:#fff;font-weight:600;font-size:15px;cursor:pointer;">Guardar</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      const $ = id => overlay.querySelector('#' + id);
      $('nm-title').value = p.title || '';
      $('nm-name').value = p.name || '';
      $('nm-role').value = p.role || '';
      $('nm-school').value = p.school || '';
      $('nm-name').focus();

      const close = () => overlay.remove();
      $('nm-cancel').addEventListener('click', close);
      overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

      $('nm-save').addEventListener('click', async () => {
        const title = $('nm-title').value;
        let name = $('nm-name').value.trim();
        if (!name) { $('nm-name').style.borderColor = '#ba1a1a'; return; }
        if (title && name.toLowerCase().startsWith(title.toLowerCase())) name = name.slice(title.length).trim();

        const db = window.AulaAbiertaDB;
        const oldFull = (p.title ? p.title + ' ' : '') + p.name;
        const newFull = (title ? title + ' ' : '') + name;
        try {
          await db.updateTeacherProfile({ title, name, role: $('nm-role').value.trim(), school: $('nm-school').value.trim() });
          // Actualiza el autor en los artículos que llevaban el nombre anterior
          const arts = await db.getAll('articles');
          for (const a of arts) {
            if (a.author === oldFull) { a.author = newFull; await db.put('articles', a); }
          }
          cachedProfile = null;
          await applyTeacherProfile();
          close();
          if (window.showToast) window.showToast('Nombre actualizado', 'success');
        } catch (err) {
          if (window.showToast) window.showToast('No se pudo guardar: ' + err.message, 'error');
        }
      });
    });
  }

  function installNameEditButton() {
    document.querySelectorAll('header [data-tp="titleName"]').forEach(el => {
      if (el.dataset.editBtn) return;
      el.dataset.editBtn = '1';
      const b = document.createElement('button');
      b.type = 'button';
      b.title = 'Editar nombre';
      b.setAttribute('aria-label', 'Editar nombre');
      b.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px">edit</span>';
      b.style.cssText = 'width:28px;height:28px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;color:#006398;background-color:#e6e8ea;padding:0;';
      b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openNameEditor(); });
      el.insertAdjacentElement('afterend', b);
    });
  }

  // Enlace "Docs" en la barra inferior y atajos hacia documentos.html
  function installDocsLink() {
    const row = document.querySelector('nav.fixed > div');
    if (!row || row.querySelector('a[href="documentos.html"]')) return;
    const a = document.createElement('a');
    a.href = 'documentos.html';
    a.setAttribute('data-path', 'documentos');
    a.className = 'flex flex-col items-center justify-center w-14 h-14 text-on-surface-variant hover:text-on-surface transition-colors';
    a.innerHTML = '<span class="material-symbols-outlined text-[22px]">folder_open</span><span class="font-label-sm text-label-sm mt-0.5">Docs</span>';
    row.appendChild(a);
  }

  function wireShortcuts() {
    document.querySelectorAll('button').forEach(b => {
      const t = b.textContent.trim();
      if (t.includes('Subir Recurso') || t === 'Gestionar') {
        b.addEventListener('click', () => { window.location.href = 'documentos.html'; });
      }
    });
  }

  async function applyTeacherProfile() {
    installHeaderAvatar();
    installNameEditButton();
    installDocsLink();

    const p = await getProfile();
    if (!p) return null;

    const photoSrc = p.photoUrl || DEFAULT_PHOTO;
    const titleName = p.title ? `${p.title} ${p.name}` : p.name;
    const yearsText = p.yearsExperience
      ? `${p.school} • ${p.yearsExperience} años de experiencia`
      : p.school;

    document.querySelectorAll('[data-tp]').forEach(el => {
      const field = el.getAttribute('data-tp');
      switch (field) {
        case 'name':        el.textContent = p.name; break;
        case 'title':       el.textContent = p.title; break;
        case 'role':        el.textContent = p.role; break;
        case 'specialty':   el.textContent = p.specialty; break;
        case 'school':      el.textContent = p.school; break;
        case 'years':       el.textContent = p.yearsExperience; break;
        case 'bio':         el.textContent = p.bio; break;
        case 'titleName':   el.textContent = titleName; break;
        case 'schoolYears': el.textContent = yearsText; break;
        case 'photo':
          el.onerror = () => { el.onerror = null; el.src = FALLBACK_PHOTO; };
          el.src = photoSrc;
          if (!el.alt || el.alt === 'Profile') el.alt = p.name;
          break;
        case 'photo-alt':
          el.alt = p.name;
          break;
        case 'greeting':
          el.textContent = `¡Buen día, ${p.title ? p.title + ' ' : ''}${firstName(p.name)}!`;
          break;
        case 'roleBadge':
          el.textContent = p.role || el.textContent;
          break;
        case 'authorLine':
          el.textContent = `Por ${titleName}`;
          break;
        case 'emptyGreeting':
          el.textContent = `¡Bandeja al día, ${p.title ? p.title + ' ' : 'Maestra '}${firstName(p.name)}!`;
          break;
        case 'districtQuota':
          el.textContent = `Cuota institucional del ${p.school}`;
          break;
        case 'photoTitle':
          el.textContent = `Retrato ${titleName}`;
          break;
      }
    });

    return p;
  }

  // Expose globally
  window.applyTeacherProfile = applyTeacherProfile;
  window.getTeacherProfile = getProfile;
  window.TEACHER_DEFAULT_PHOTO = DEFAULT_PHOTO;
  window.openNameEditor = openNameEditor;

  function start() {
    if (document.body.hasAttribute('data-auto-profile')) {
      wireShortcuts();
      applyTeacherProfile();
    }
  }

  // Auto-apply when DOM ready if body has data-auto-profile
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
