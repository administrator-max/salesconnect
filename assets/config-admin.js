/**
 * Shared, self-contained data-driven config admin widget.
 * Usage:
 *   ConfigAdmin.open({
 *     basePath: 'api',                 // module API base (relative)
 *     title:    'Settings',
 *     lookups:  [{ key:'cargo_types', title:'Cargo Types', fields:[] },
 *                { key:'channels',    title:'Channels', fields:[['label','Label','text'],['color','BG','color']] }],
 *     onChange: () => reloadMyDropdowns(),   // called after any add/edit/delete
 *   });
 *
 * Value-only lookups use fields:[] (just the code + enable/delete). Writes require
 * a logged-in session (the API enforces it). Built with safe DOM APIs (no innerHTML).
 */
(function () {
  function mk(tag, attrs, kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'onclick') n.addEventListener('click', attrs[k]);
      else if (k === 'onchange') n.addEventListener('change', attrs[k]);
      else if (k === 'style') n.style.cssText = attrs[k];
      else if (k === 'value') n.value = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(c => n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  }

  const S = {
    overlay: 'position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px',
    box: 'background:#fff;border-radius:14px;max-width:620px;width:100%;max-height:86vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3);font-family:system-ui,sans-serif',
    hd: 'display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid #e2e8f0',
    tabs: 'display:flex;gap:6px;padding:12px 16px 0;flex-wrap:wrap',
    tab: 'padding:6px 12px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;font-size:13px;cursor:pointer;color:#475569',
    tabOn: 'padding:6px 12px;border:1px solid #2563eb;border-radius:8px;background:#eff6ff;font-size:13px;cursor:pointer;color:#1d4ed8;font-weight:600',
    body: 'overflow:auto;padding:12px 16px 18px',
    inp: 'padding:5px 7px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px',
    btn: 'padding:4px 9px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;font-size:12px;cursor:pointer',
    addBtn: 'padding:5px 12px;border:none;border-radius:7px;background:#2563eb;color:#fff;font-size:13px;cursor:pointer',
  };

  let cfg = {}, data = {}, tab = null, root = null;

  async function req(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(cfg.basePath + path, opts);
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || ('HTTP ' + res.status)); }
    return res.json().catch(() => ({}));
  }

  async function load() {
    try { data = await req('GET', '/config?all=1'); }
    catch (e) { data = {}; alert('Load config gagal: ' + e.message); }
  }

  function close() { if (root) { root.remove(); root = null; } }

  function renderTabs(tabsEl) {
    tabsEl.replaceChildren(...cfg.lookups.map(l =>
      mk('button', { style: tab === l.key ? S.tabOn : S.tab, text: l.title, onclick: () => { tab = l.key; render(); } })));
  }

  function render() {
    const bodyEl = root.querySelector('[data-ca-body]');
    renderTabs(root.querySelector('[data-ca-tabs]'));
    const lk = cfg.lookups.find(l => l.key === tab);
    const rows = data[lk.key] || [];
    const fields = lk.fields || [];

    const headCells = [mk('th', { style: 'text-align:left;padding:4px 6px;font-size:11px;color:#64748b', text: lk.fields.length ? 'value' : 'value' })]
      .concat(fields.map(f => mk('th', { style: 'text-align:left;padding:4px 6px;font-size:11px;color:#64748b', text: f[1] })))
      .concat([mk('th')]);

    const bodyRows = rows.map(r => {
      const inactive = String(r.active).toUpperCase() === 'FALSE';
      const cells = fields.map(f => {
        const [col, , type] = f;
        const input = mk('input', { value: r[col] == null ? '' : r[col], style: (type === 'color' ? 'width:46px;' : '') + S.inp,
          onchange: (e) => update(lk.key, r.value, col, e.target.value) });
        if (type === 'color') input.type = 'color';
        return mk('td', { style: 'padding:3px 6px' }, [input]);
      });
      return mk('tr', { style: 'opacity:' + (inactive ? 0.45 : 1) }, [
        mk('td', { style: 'padding:3px 6px;font-size:13px' }, [mk('code', { text: r.value })]),
        ...cells,
        mk('td', { style: 'padding:3px 6px;text-align:right;white-space:nowrap' }, [
          mk('button', { style: S.btn, text: inactive ? 'Enable' : 'Disable', onclick: () => toggle(lk.key, r.value, inactive) }),
          mk('button', { style: S.btn + ';color:#dc2626;border-color:#fecaca;margin-left:4px', text: 'Delete', onclick: () => del(lk.key, r.value) }),
        ]),
      ]);
    });

    const addVal = mk('input', { placeholder: 'new value', style: S.inp });
    const addFields = fields.map(f => { const i = mk('input', { placeholder: f[1], style: (f[2] === 'color' ? 'width:46px;' : '') + S.inp }); if (f[2] === 'color') i.type = 'color'; return i; });
    const addRow = mk('tr', { style: 'border-top:2px solid #e2e8f0' }, [
      mk('td', { style: 'padding:4px 6px' }, [addVal]),
      ...addFields.map(i => mk('td', { style: 'padding:4px 6px' }, [i])),
      mk('td', { style: 'padding:4px 6px;text-align:right' }, [
        mk('button', { style: S.addBtn, text: 'Add', onclick: () => {
          const value = (addVal.value || '').trim();
          if (!value) { alert('value wajib diisi'); return; }
          const body = { value };
          fields.forEach((f, idx) => { if (addFields[idx].value) body[f[0]] = addFields[idx].value; });
          add(lk.key, body);
        } }),
      ]),
    ]);

    const table = mk('table', { style: 'width:100%;border-collapse:collapse' }, [
      mk('thead', null, [mk('tr', null, headCells)]),
      mk('tbody', null, [...bodyRows, addRow]),
    ]);
    const note = mk('div', { style: 'font-size:11px;color:#94a3b8;margin-top:8px',
      text: 'value is the stored code (immutable). Disabling hides an option without affecting historical records.' });
    bodyEl.replaceChildren(table, note);
  }

  async function afterChange() { await load(); render(); if (cfg.onChange) { try { await cfg.onChange(); } catch (e) {} } }
  async function add(key, body) { try { await req('POST', '/config/' + key, body); await afterChange(); } catch (e) { alert(e.message); } }
  async function update(key, value, field, val) { try { await req('PUT', '/config/' + key + '/' + encodeURIComponent(value), { [field]: val }); if (cfg.onChange) cfg.onChange(); } catch (e) { alert(e.message); await afterChange(); } }
  async function toggle(key, value, on) { try { await req('PUT', '/config/' + key + '/' + encodeURIComponent(value), { active: on ? 'TRUE' : 'FALSE' }); await afterChange(); } catch (e) { alert(e.message); } }
  async function del(key, value) { if (!confirm("Hapus '" + value + "'? (record lama tidak terpengaruh)")) return; try { await req('DELETE', '/config/' + key + '/' + encodeURIComponent(value)); await afterChange(); } catch (e) { alert(e.message); } }

  async function open(options) {
    cfg = Object.assign({ basePath: 'api', title: 'Settings' }, options);
    tab = cfg.lookups[0].key;
    close();
    const bodyEl = mk('div', { style: S.body, 'data-ca-body': '1' });
    const tabsEl = mk('div', { style: S.tabs, 'data-ca-tabs': '1' });
    const box = mk('div', { style: S.box }, [
      mk('div', { style: S.hd }, [
        mk('div', { style: 'font-weight:700;font-size:16px', text: '⚙ ' + cfg.title }),
        mk('button', { style: 'border:none;background:none;font-size:20px;cursor:pointer;color:#64748b', text: '✕', onclick: close }),
      ]),
      tabsEl, bodyEl,
    ]);
    root = mk('div', { style: S.overlay, onclick: (e) => { if (e.target === root) close(); } }, [box]);
    document.body.appendChild(root);
    await load();
    render();
  }

  window.ConfigAdmin = { open };
})();
