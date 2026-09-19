const titles = {
  importar: ["Importação", "ZIPs Google LERS — extração sem alterar originais, hash e identificação de produtos."],
  painel: ["Painel da conta", "Conta Google analisada, e-mails, telefones, criação, última atividade e status."],
  dispositivos: ["Dispositivos", "IMEI, modelo, fabricante, série, vínculos e alerta de aparelho com múltiplas contas."],
  eventos: ["Eventos", "Linha do tempo investigativa por data, hora, produto e dispositivo."],
  mapa: ["Localização Google Maps", "Latitude, longitude, data, hora e permanência. Destaque da DATA DO CRIME."],
  fotos: ["Fotos", "Google Photos com miniatura, GPS, EXIF e filtro de proximidade ao crime."],
  arquivos: ["Arquivos", "Google Drive com pesquisa por PIX, CPF, BANCO, ARMA, DROGA, NOME, TELEFONE e VALOR."],
  gmail: ["Gmail", "Leitor MBOX: remetente, destinatário, data, assunto, texto, Message-ID e IP."],
  pagamentos: ["Pagamentos", "Cartões, perfis, compras, valores, datas e IDs de transação do Google Pay."],
  pesquisas: ["Histórico pesquisa", "Termo pesquisado, data, hora e dispositivo."],
  whatsapp: ["WhatsApp backup", "Identificação de backup no Drive, sem tentativa de quebra de cifra."],
  correlacao: ["Correlação investigativa", "Vínculos CONTA → IMEI → LOCALIZAÇÃO → FOTOS → ARQUIVOS → PAGAMENTOS → EVENTOS."],
  relatorio: ["Relatório policial", "Geração de DOCX e PDF com os achados da investigação."]
};

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dash = (v) => (v === 0 ? "0" : v ? esc(v) : "—");

async function api(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    let msg = "Falha na requisição";
    try {
      const data = await res.json();
      msg = data.error || msg;
    } catch (_) {}
    throw new Error(msg);
  }
  const type = res.headers.get("content-type") || "";
  if (type.includes("application/json")) return res.json();
  return res;
}

function table(headers, rows) {
  if (!rows.length) return `<div class="notice">Nenhum registro extraído nesta aba.</div>`;
  return `<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function showView(name) {
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === `view-${name}`));
  document.querySelectorAll(".nav button").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === name));
  const meta = titles[name] || [name, ""];
  $("viewTitle").textContent = meta[0];
  $("viewHint").textContent = meta[1];
  loaders[name]?.();
}

const loaders = {
  importar: loadImport,
  painel: loadDashboard,
  dispositivos: loadDevices,
  eventos: loadEvents,
  mapa: loadMap,
  fotos: loadPhotos,
  arquivos: loadFiles,
  gmail: loadMail,
  pagamentos: loadPay,
  pesquisas: loadSearch,
  whatsapp: loadWhatsapp,
  correlacao: loadCorr
};

async function loadImport() {
  const data = await api("/api/dashboard");
  $("productList").innerHTML = (data.products || [])
    .map((p) => `<span class="chip">${esc(p.product_name)} · ${p.file_count}</span>`)
    .join("") || `<span class="chip">Nenhum produto ainda</span>`;
  $("importList").innerHTML = table(
    ["Arquivo original", "SHA-256", "SHA-1", "MD5", "Tamanho", "Arquivos", "Importado"],
    (data.imports || []).map(
      (r) => `<tr>
        <td>${esc(r.original_filename)}</td>
        <td class="hash">${esc(r.sha256)}</td>
        <td class="hash">${esc(r.sha1)}</td>
        <td class="hash">${esc(r.md5)}</td>
        <td>${r.size_mb} MB</td>
        <td>${r.file_count}</td>
        <td>${dash(r.imported_display)}</td>
      </tr>`
    )
  );
  hydrateCrime(data.case);
}

function hydrateCrime(caso) {
  if (!caso) return;
  if (caso.crime_date) {
    const dt = new Date(caso.crime_date);
    if (!Number.isNaN(dt.getTime())) {
      const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      $("crimeDate").value = local;
    }
  }
  if (caso.crime_window_hours) $("crimeWindow").value = caso.crime_window_hours;
}

async function loadDashboard() {
  const data = await api("/api/dashboard");
  const c = data.counts || {};
  const stats = [
    ["Contas", c.accounts],
    ["Dispositivos", c.devices],
    ["Eventos", c.events],
    ["Locais", c.locations],
    ["Fotos", c.photos],
    ["Arquivos", c.files],
    ["E-mails", c.emails],
    ["Pagamentos", c.payments],
    ["Pesquisas", c.searches],
    ["WhatsApp", c.whatsapp_backups],
    ["Produtos", c.products],
    ["Alertas", (data.alerts || []).length]
  ];
  $("statGrid").innerHTML = stats
    .map(([label, n], i) => `<div class="stat ${label === "Alertas" && n ? "alert" : ""}"><b>${n || 0}</b><span>${label}</span></div>`)
    .join("");
  $("alertStrip").innerHTML = (data.alerts || [])
    .map((a) => `<div class="alert">${esc(a.alert)} — IMEI ${esc(a.imei)} · ${esc((a.accounts || []).join(", "))}</div>`)
    .join("");
  $("accountCards").innerHTML = (data.accounts || [])
    .map(
      (a) => `<article class="panel account-card">
        <h3>${dash(a.display_name || a.primary_email)}</h3>
        <div class="kv">
          <b>Conta Google</b><span>${dash(a.google_account)}</span>
          <b>Nome</b><span>${dash(a.display_name)}</span>
          <b>E-mail principal</b><span>${dash(a.primary_email)}</span>
          <b>E-mails alternativos</b><span>${dash((a.alternate_emails || []).join(", "))}</span>
          <b>Telefones vinculados</b><span>${dash((a.phones || []).join(", "))}</span>
          <b>Data criação da conta</b><span>${dash(a.created_display)}</span>
          <b>Última atividade</b><span>${dash(a.last_activity_display)}</span>
          <b>Status da conta</b><span>${dash(a.status)}</span>
          <b>Data de exclusão</b><span>${dash(a.deletion_display)}</span>
        </div>
      </article>`
    )
    .join("") || `<article class="panel">Importe um ZIP para preencher o painel da conta.</article>`;
}

async function loadDevices() {
  const data = await api("/api/devices");
  $("deviceAlerts").innerHTML = (data.alerts || [])
    .map((a) => `<div class="alert">${esc(a.alert)} — IMEI ${esc(a.imei)} vinculado a ${esc((a.accounts || []).join(", "))}</div>`)
    .join("") || "";
  $("deviceTable").innerHTML = table(
    ["IMEI 1", "IMEI 2", "Modelo", "Fabricante", "Série", "Primeiro vínculo", "Último vínculo", "Contas Google associadas", "Alerta"],
    (data.devices || []).map(
      (d) => `<tr>
        <td>${dash(d.imei1)}</td><td>${dash(d.imei2)}</td><td>${dash(d.model)}</td>
        <td>${dash(d.manufacturer)}</td><td>${dash(d.serial_number)}</td>
        <td>${dash(d.first_display)}</td><td>${dash(d.last_display)}</td>
        <td>${dash((d.accounts || []).join(", "))}</td>
        <td>${d.multi_account ? '<span class="chip warn">Mesmo aparelho vinculado a múltiplas contas</span>' : "—"}</td>
      </tr>`
    )
  );
}

async function loadEvents() {
  const from = $("evFrom").value;
  const to = $("evTo").value;
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const data = await api(`/api/events?${qs}`);
  $("eventTable").innerHTML = table(
    ["Data", "Hora", "Evento", "Produto Google", "Dispositivo relacionado"],
    (data.events || []).map(
      (e) => `<tr>
        <td>${dash(e.date)}</td><td>${dash(e.time)}</td>
        <td>${dash(e.description || e.event_type)}</td>
        <td>${dash(e.product)}</td><td>${dash(e.device_ref)}</td>
      </tr>`
    )
  );
}

async function loadMap() {
  const near = $("nearOnly").checked ? "1" : "0";
  $("mapFrame").src = `/api/map?near_crime=${near}&t=${Date.now()}`;
  const data = await api(`/api/locations?near_crime=${near}`);
  $("locTable").innerHTML = table(
    ["Data", "Hora", "Latitude", "Longitude", "Permanência", "Local", "Próximo ao crime"],
    (data.locations || []).map(
      (l) => `<tr>
        <td>${dash(l.date)}</td><td>${dash(l.time)}</td>
        <td>${dash(l.lat)}</td><td>${dash(l.lon)}</td>
        <td>${l.permanencia != null ? l.permanencia + " min" : "—"}</td>
        <td>${dash(l.place_name)}</td>
        <td>${l.near_crime ? "SIM" : "não"}</td>
      </tr>`
    )
  );
}

async function loadPhotos() {
  const qs = new URLSearchParams();
  if ($("photoNear").checked) qs.set("near_crime", "1");
  if ($("photoGps").checked) qs.set("with_gps", "1");
  const data = await api(`/api/photos?${qs}`);
  $("photoGrid").innerHTML = (data.photos || [])
    .map(
      (p) => `<article class="photo-card ${p.near_crime ? "near" : ""}" data-photo="${p.id}">
        <img src="/api/photos/${p.id}/thumb" alt="${esc(p.filename)}">
        <div class="meta">
          <b>${esc(p.filename)}</b><br>
          ${dash(p.datetime)}<br>
          GPS: ${p.has_gps ? `${p.lat}, ${p.lon}` : "sem localização"}
        </div>
      </article>`
    )
    .join("") || `<div class="notice">Nenhuma foto extraída.</div>`;
  $("photoGrid").onclick = (ev) => {
    const card = ev.target.closest(".photo-card");
    if (!card) return;
    const photo = (data.photos || []).find((x) => String(x.id) === card.dataset.photo);
    if (!photo) return;
    const exif = Object.entries(photo.exif || {})
      .slice(0, 40)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    openModal(
      photo.filename,
      `Data: ${photo.datetime || "—"}\nGPS: ${photo.has_gps ? photo.lat + ", " + photo.lon : "—"}\n\nMetadados EXIF:\n${exif || "(sem EXIF)"}\n\nArquivo: ${photo.stored_path || ""}`
    );
  };
}

async function loadFiles() {
  const q = $("fileQuery").value;
  const data = await api(`/api/files?q=${encodeURIComponent(q)}`);
  $("kwChips").innerHTML = (data.keywords || [])
    .map((k) => `<button class="chip gold" type="button" data-kw="${esc(k)}">${esc(k)}</button>`)
    .join("");
  $("fileTable").innerHTML = table(
    ["Nome", "Tipo", "Data criação", "Data alteração", "Proprietário", "Palavras"],
    (data.files || []).map(
      (f) => `<tr>
        <td>${dash(f.name)}</td><td>${dash(f.mime_type)}</td>
        <td>${dash(f.created_display)}</td><td>${dash(f.modified_display)}</td>
        <td>${dash(f.owner)}</td>
        <td>${(f.keywords || []).map((k) => `<span class="chip warn">${esc(k)}</span>`).join(" ") || "—"}</td>
      </tr>`
    )
  );
}

async function loadMail() {
  const q = $("mailQuery").value;
  const data = await api(`/api/emails?q=${encodeURIComponent(q)}`);
  $("mailTable").innerHTML = table(
    ["Remetente", "Destinatário", "Data", "Assunto", "Texto", "ID mensagem", "IP"],
    (data.emails || []).map(
      (m) => `<tr>
        <td>${dash(m.sender)}</td><td>${dash(m.recipients)}</td>
        <td>${dash(m.datetime)}</td><td>${dash(m.subject)}</td>
        <td>${dash((m.body || "").slice(0, 160))}</td>
        <td class="hash">${dash(m.message_id)}</td>
        <td>${dash(m.ip_address)}</td>
      </tr>`
    )
  );
}

async function loadPay() {
  const data = await api("/api/payments");
  $("payTable").innerHTML = table(
    ["Tipo", "Descrição / cartão / perfil", "Valor", "Moeda", "Data", "ID transação"],
    (data.payments || []).map(
      (p) => `<tr>
        <td>${dash(p.kind)}</td><td>${dash(p.description)}</td>
        <td>${dash(p.amount)}</td><td>${dash(p.currency)}</td>
        <td>${dash(p.datetime)}</td><td class="hash">${dash(p.transaction_id)}</td>
      </tr>`
    )
  );
}

async function loadSearch() {
  const data = await api("/api/searches");
  $("searchTable").innerHTML = table(
    ["Termo pesquisado", "Data", "Hora", "Dispositivo"],
    (data.searches || []).map(
      (s) => `<tr>
        <td>${dash(s.query)}</td><td>${dash(s.date)}</td>
        <td>${dash(s.time)}</td><td>${dash(s.device_ref)}</td>
      </tr>`
    )
  );
}

async function loadWhatsapp() {
  const data = await api("/api/whatsapp");
  $("waTable").innerHTML = table(
    ["Arquivo", "Data backup", "Tamanho", "Conta vinculada", "Cifrado", "Observação"],
    (data.backups || []).map(
      (b) => `<tr>
        <td>${dash(b.filename)}</td><td>${dash(b.datetime)}</td>
        <td>${b.size_mb} MB</td><td>${dash(b.linked_account)}</td>
        <td>${b.encrypted ? "SIM — sem quebra de cifra" : "não"}</td>
        <td>${dash(b.note)}</td>
      </tr>`
    )
  );
}

async function loadCorr() {
  const data = await api("/api/correlation");
  $("chain").innerHTML = (data.chain || []).map((x, i) => `${i ? "<em>↓</em>" : ""}<span>${esc(x)}</span>`).join("");
  $("corrAlerts").innerHTML = (data.alerts || [])
    .map((a) => `<div class="alert">${esc(a.alert)} — IMEI ${esc(a.imei)} · ${esc((a.accounts || []).join(" · "))}</div>`)
    .join("");
  drawGraph(data);
}

function drawGraph(data) {
  const svg = $("graph");
  const groups = {
    root: "#c5a253",
    account: "#4da6ff",
    imei: "#e08a91",
    location: "#63c59a",
    photo: "#d8bc78",
    file: "#b7a1ff",
    payment: "#f0a36b",
    event: "#9aa9a1"
  };
  const nodes = data.nodes || [];
  const width = 1200;
  const height = 640;
  const cols = 7;
  const placed = nodes.map((n, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return { ...n, x: 90 + col * 160, y: 70 + row * 90 };
  });
  const byId = Object.fromEntries(placed.map((n) => [n.id, n]));
  const lines = (data.edges || [])
    .map((e) => {
      const a = byId[e.from];
      const b = byId[e.to];
      if (!a || !b) return "";
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#2a3f36" stroke-width="1.2"/>`;
    })
    .join("");
  const circles = placed
    .map(
      (n) => `<g>
        <circle cx="${n.x}" cy="${n.y}" r="18" fill="${groups[n.group] || "#2d6a56"}" stroke="#111820"/>
        <text x="${n.x}" y="${n.y + 32}" text-anchor="middle" fill="#e8efe9" font-size="10">${esc((n.label || "").slice(0, 22))}</text>
      </g>`
    )
    .join("");
  svg.innerHTML = lines + circles;
}

function openModal(title, body) {
  $("modalTitle").textContent = title;
  $("modalBody").textContent = body;
  $("modal").hidden = false;
}

async function importFiles(files) {
  if (!files.length) return;
  $("progressWrap").hidden = false;
  $("progressText").textContent = "Importando e analisando produção Google…";
  const fd = new FormData();
  for (const file of files) fd.append("files", file);
  try {
    const data = await api("/api/import", { method: "POST", body: fd });
    $("progressText").textContent = `Concluído: ${data.imports.length} arquivo(s).`;
    await loadImport();
    showView("painel");
  } catch (err) {
    $("progressText").textContent = err.message;
  }
}

$("nav").addEventListener("click", (ev) => {
  const btn = ev.target.closest("button[data-view]");
  if (btn) showView(btn.dataset.view);
});
$("pickZip").onclick = () => $("zipInput").click();
$("zipInput").onchange = (ev) => importFiles([...ev.target.files]);
["dragenter", "dragover"].forEach((evt) => {
  $("dropzone").addEventListener(evt, (e) => {
    e.preventDefault();
    $("dropzone").classList.add("over");
  });
});
["dragleave", "drop"].forEach((evt) => {
  $("dropzone").addEventListener(evt, (e) => {
    e.preventDefault();
    $("dropzone").classList.remove("over");
  });
});
$("dropzone").addEventListener("drop", (e) => importFiles([...e.dataTransfer.files]));
$("loadDemo").onclick = async () => {
  $("progressWrap").hidden = false;
  $("progressText").textContent = "Gerando e analisando produção fictícia de demonstração…";
  await api("/api/demo", { method: "POST" });
  await loadImport();
  showView("painel");
};
$("saveCrime").onclick = async () => {
  await api("/api/case/crime-date", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ crime_date: $("crimeDate").value, window_hours: Number($("crimeWindow").value || 24) })
  });
  const current = document.querySelector(".nav button.active")?.dataset.view;
  if (current) loaders[current]?.();
};
$("newCase").onclick = async () => {
  const name = prompt("Nome do novo caso:", "Investigação Google LERS");
  if (!name) return;
  await api("/api/case", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  location.reload();
};
$("evFilter").onclick = loadEvents;
$("evClear").onclick = () => {
  $("evFrom").value = "";
  $("evTo").value = "";
  loadEvents();
};
$("reloadMap").onclick = loadMap;
$("nearOnly").onchange = loadMap;
$("photoFilter").onclick = loadPhotos;
$("mailSearch").onclick = loadMail;
$("fileQuery").addEventListener("keydown", (e) => {
  if (e.key === "Enter") loadFiles();
});
$("kwChips").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-kw]");
  if (!btn) return;
  $("fileQuery").value = btn.dataset.kw;
  loadFiles();
});
$("modalClose").onclick = () => ($("modal").hidden = true);
$("modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") $("modal").hidden = true;
});

loadImport().catch(() => {});
