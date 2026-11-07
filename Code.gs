/*******************************************************
 *  LUCAS EVOLUCIONA · Futurmovil  (v1.0)
 *  API JSON para la web de GitHub Pages (puntofibra.github.io/lucasevoluciona)
 *  - Cuentas: correo + contraseña (recuperable) o Google
 *  - Récords, ranking diario / semanal / total y racha de días
 *  - Panel admin oculto: llave NFC o Google Authenticator
 *  Implementar > Aplicación web > Ejecutar como: Yo · Acceso: Cualquier usuario
 *******************************************************/

var APP_NAME = 'LUCAS EVOLUCIONA';
var SHEET_ID = '12HvmsnBMD8vRIcBO_9876ImV06a52XEPXWWd_BLXPrk';
var PUBLIC_BASE_URL = 'https://puntofibra.github.io/lucasevoluciona/';
var ADMIN_EMAIL = 'futurmovil.com@gmail.com';
var GOOGLE_CLIENT_ID = '454055120059-nuhaop4r62urc3u036cc3grpqo71ulg7.apps.googleusercontent.com';
var TZ = 'Europe/Madrid';

var AJUSTES_DEF = {
  banner: '',          // aviso que sale en el menú
  mant: false,         // modo mantenimiento
  mantMsg: 'Lucas está en el taller. Vuelve en un rato.',
  imgVer: 1            // súbelo para forzar que se recarguen las imágenes
};

/* ═════════════════ ENTRADA ═════════════════ */

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.accion) return responder_(manejar_(p), p.callback);
  return HtmlService.createHtmlOutput('<meta http-equiv="refresh" content="0;url=' + PUBLIC_BASE_URL + '">LUCAS EVOLUCIONA');
}
function doPost(e) {
  var p = {};
  try { p = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (err) { }
  return responder_(manejar_(p));
}
function responder_(out, cb) {
  var j = JSON.stringify(out);
  if (cb && /^[\w.]+$/.test(cb)) return ContentService.createTextOutput(cb + '(' + j + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(j).setMimeType(ContentService.MimeType.JSON);
}

function manejar_(p) {
  try {
    var a = String(p.accion || ''), r;
    switch (a) {
      case 'config':      r = { cfg: cfgPub_() }; break;
      case 'registro':    r = registrar_(p); break;
      case 'entrar':      r = entrar_(p); break;
      case 'google':      r = google_(p); break;
      case 'yo':          r = { user: pubUser_(sesion_(p.ses)) }; break;
      case 'salir':       r = salir_(p); break;
      case 'recuperar':   r = recuperar_(p); break;
      case 'restablecer': r = restablecer_(p); break;
      case 'partida':     r = partida_(p); break;
      case 'ranking':     r = ranking_(p); break;
      case 'salaCrear':   r = salaCrear_(p); break;
      case 'salaVer':     r = salaVer_(p); break;
      case 'salaUnir':    r = salaUnir_(p); break;
      case 'admLlave':    r = adminLlave_(p); break;
      case 'admTotp':     r = adminTotp_(p); break;
      case 'adm':         r = admin_(p); break;
      default: throw new Error('Acción desconocida');
    }
    r = r || {};
    if (r.ok === undefined) r.ok = true;
    return r;
  } catch (e) {
    return { ok: false, error: String(e && e.message || e).replace(/^Error:\s*/, '') };
  }
}

/* ═════════════════ AJUSTES ═════════════════ */

function cfg_() {
  var c = {}; try { c = JSON.parse(PropertiesService.getScriptProperties().getProperty('cfg') || '{}'); } catch (e) { }
  return Object.assign({}, AJUSTES_DEF, c);
}
function guardaCfg_(c) { PropertiesService.getScriptProperties().setProperty('cfg', JSON.stringify(c)); }
function cfgPub_() { var c = cfg_(); return { banner: c.banner, mant: c.mant, mantMsg: c.mantMsg, imgVer: c.imgVer, hoy: hoy_() }; }

/* ═════════════════ UTILIDADES ═════════════════ */

function ss_() { return SpreadsheetApp.openById(SHEET_ID); }
function hoja_(nombre, cab) {
  var ss = ss_(), sh = ss.getSheetByName(nombre);
  if (!sh) {
    sh = ss.insertSheet(nombre);
    sh.appendRow(cab); sh.getRange(1, 1, 1, cab.length).setFontWeight('bold').setBackground('#0b1328').setFontColor('#17ff5f');
    sh.setFrozenRows(1);
  }
  return sh;
}
function hoy_(d) { return Utilities.formatDate(d || new Date(), TZ, 'yyyy-MM-dd'); }
function ayer_() { return hoy_(new Date(Date.now() - 86400000)); }
function lunes_() {
  var d = new Date(), dia = Number(Utilities.formatDate(d, TZ, 'u')); // 1 = lunes
  return hoy_(new Date(d.getTime() - (dia - 1) * 86400000));
}
function sha_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
function limpiaEmail_(e) { return String(e || '').trim().toLowerCase(); }
function emailOk_(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function freno_(clave, max, seg) {
  var c = CacheService.getScriptCache(), k = 'fr_' + clave, n = Number(c.get(k) || 0);
  if (n >= max) throw new Error('Demasiados intentos. Espera unos minutos.');
  c.put(k, String(n + 1), seg);
}
function lockU_(fn) { var l = LockService.getScriptLock(); l.waitLock(15000); try { return fn(); } finally { l.releaseLock(); } }
function err_(m) { throw new Error(m); }

/* ═════════════════ USUARIOS ═════════════════ */

var U = { Id: 0, Email: 1, Nombre: 2, Hash: 3, Sal: 4, Google: 5, Creado: 6, Ultimo: 7, Partidas: 8, Bloqueado: 9, Tokens: 10,
          Mejor: 11, Nivel: 12, Racha: 13, RachaMax: 14, UltDia: 15 };
var U_CAB = ['Id', 'Email', 'Nombre', 'Hash', 'Sal', 'Google', 'Creado', 'Último acceso', 'Partidas', 'Bloqueado', 'Sesiones',
             'Récord', 'Nivel máx', 'Racha', 'Racha máx', 'Último día jugado'];

function usuarios_() {
  var sh = hoja_('Usuarios', U_CAB), n = sh.getLastRow();
  if (sh.getLastColumn() < U_CAB.length) sh.getRange(1, 1, 1, U_CAB.length).setValues([U_CAB]);
  var rows = n > 1 ? sh.getRange(2, 1, n - 1, U_CAB.length).getValues() : [];
  return { sh: sh, rows: rows };
}
function guardaFila_(sh, i, row) { sh.getRange(i + 2, 1, 1, row.length).setValues([row]); }
function buscar_(rows, col, v) { for (var i = 0; i < rows.length; i++) if (String(rows[i][col]).toLowerCase() === String(v).toLowerCase()) return i; return -1; }
function nuevaFila_(email, nombre, hash, sal, google) {
  return ['U' + Date.now().toString(36), email, nombre, hash, sal, google, new Date(), new Date(), 0, '', '[]', 0, 0, 0, 0, ''];
}
function nombreLibre_(rows, nombre, salvo) {
  for (var i = 0; i < rows.length; i++) if (i !== salvo && String(rows[i][U.Nombre]).toLowerCase() === nombre.toLowerCase()) return false;
  return true;
}

function nuevaSesion_(sh, i, row) {
  var t = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().slice(0, 8);
  var list = []; try { list = JSON.parse(row[U.Tokens] || '[]'); } catch (e) { }
  list.push(t); if (list.length > 6) list = list.slice(-6);
  row[U.Tokens] = JSON.stringify(list);
  row[U.Ultimo] = new Date();
  guardaFila_(sh, i, row);
  CacheService.getScriptCache().put('ses_' + t, row[U.Email], 21600);
  return { ses: t, user: pubUser_(userObj_(row)) };
}
function userObj_(row) {
  var racha = Number(row[U.Racha] || 0), ult = row[U.UltDia] ? String(row[U.UltDia]) : '';
  if (row[U.UltDia] instanceof Date) ult = hoy_(row[U.UltDia]);
  if (ult !== hoy_() && ult !== ayer_()) racha = 0;   // la racha se ha roto
  return { email: row[U.Email], nombre: row[U.Nombre], partidas: Number(row[U.Partidas] || 0), bloqueado: !!row[U.Bloqueado],
           mejor: Number(row[U.Mejor] || 0), nivel: Number(row[U.Nivel] || 0), racha: racha, rachaMax: Number(row[U.RachaMax] || 0), ultDia: ult };
}
function pubUser_(u) {
  return { email: u.email, nombre: u.nombre, partidas: u.partidas, admin: u.email === ADMIN_EMAIL,
           mejor: u.mejor, nivel: u.nivel, racha: u.racha, rachaMax: u.rachaMax, jugadoHoy: u.ultDia === hoy_() };
}

function sesion_(t) {
  t = String(t || '');
  if (t.length < 20) throw new Error('SESION');
  var email = CacheService.getScriptCache().get('ses_' + t);
  var f = usuarios_(), i = -1;
  if (email) i = buscar_(f.rows, U.Email, email);
  if (i < 0) {
    for (var k = 0; k < f.rows.length; k++) { if (String(f.rows[k][U.Tokens] || '').indexOf(t) >= 0) { i = k; break; } }
    if (i < 0) throw new Error('SESION');
    CacheService.getScriptCache().put('ses_' + t, f.rows[i][U.Email], 21600);
  }
  var u = userObj_(f.rows[i]);
  if (u.bloqueado) throw new Error('Tu cuenta está bloqueada');
  u.fila = i; u.f = f;
  return u;
}

function registrar_(p) {
  var email = limpiaEmail_(p.email), nombre = String(p.nombre || '').replace(/[<>"]/g, '').trim().slice(0, 16), pass = String(p.pass || '');
  if (!emailOk_(email)) throw new Error('Correo no válido');
  if (nombre.length < 2) throw new Error('Elige un nombre de jugador');
  if (pass.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
  freno_('reg', 30, 3600);
  return lockU_(function () {
    var f = usuarios_();
    if (buscar_(f.rows, U.Email, email) >= 0) throw new Error('Ya hay una cuenta con ese correo. Entra o recupera tu contraseña.');
    if (!nombreLibre_(f.rows, nombre, -1)) throw new Error('Ese nombre de jugador ya existe. Prueba con otro.');
    var sal = Utilities.getUuid();
    var row = nuevaFila_(email, nombre, sha_(sal + pass), sal, '');
    f.sh.appendRow(row);
    return nuevaSesion_(f.sh, f.rows.length, row);
  });
}
function entrar_(p) {
  var email = limpiaEmail_(p.email), pass = String(p.pass || '');
  freno_('in_' + email, 10, 900);
  return lockU_(function () {
    var f = usuarios_(), i = buscar_(f.rows, U.Email, email);
    if (i < 0) throw new Error('No hay ninguna cuenta con ese correo');
    var row = f.rows[i];
    if (!row[U.Hash]) throw new Error('Esta cuenta se creó con Google: usa el botón de Google o recupera la contraseña');
    if (sha_(row[U.Sal] + pass) !== row[U.Hash]) throw new Error('Contraseña incorrecta');
    if (row[U.Bloqueado]) throw new Error('Tu cuenta está bloqueada');
    return nuevaSesion_(f.sh, i, row);
  });
}
function google_(p) {
  var r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(p.credential || ''), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('No se pudo verificar tu cuenta de Google');
  var info = JSON.parse(r.getContentText());
  if (info.aud !== GOOGLE_CLIENT_ID || String(info.email_verified) !== 'true') throw new Error('Cuenta de Google no válida');
  var email = limpiaEmail_(info.email);
  return lockU_(function () {
    var f = usuarios_(), i = buscar_(f.rows, U.Email, email);
    if (i >= 0) {
      if (f.rows[i][U.Bloqueado]) throw new Error('Tu cuenta está bloqueada');
      f.rows[i][U.Google] = info.sub; return nuevaSesion_(f.sh, i, f.rows[i]);
    }
    var base = String(info.given_name || info.name || email.split('@')[0]).replace(/[<>"]/g, '').slice(0, 13), nombre = base, n = 2;
    while (!nombreLibre_(f.rows, nombre, -1)) nombre = base + (n++);
    var row = nuevaFila_(email, nombre, '', '', info.sub);
    f.sh.appendRow(row);
    return nuevaSesion_(f.sh, f.rows.length, row);
  });
}
function salir_(p) {
  CacheService.getScriptCache().remove('ses_' + p.ses);
  try {
    lockU_(function () {
      var f = usuarios_();
      for (var i = 0; i < f.rows.length; i++) {
        var s = String(f.rows[i][U.Tokens] || '');
        if (s.indexOf(p.ses) >= 0) {
          var l = JSON.parse(s).filter(function (x) { return x !== p.ses; });
          f.sh.getRange(i + 2, U.Tokens + 1).setValue(JSON.stringify(l)); break;
        }
      }
    });
  } catch (e) { }
  return {};
}
function recuperar_(p) {
  var email = limpiaEmail_(p.email);
  freno_('rec_' + email, 4, 1800);
  var f = usuarios_();
  if (buscar_(f.rows, U.Email, email) < 0) throw new Error('No hay ninguna cuenta con ese correo');
  var code = String(100000 + Math.floor(Math.random() * 900000));
  CacheService.getScriptCache().put('rec_' + email, code, 900);
  MailApp.sendEmail({
    to: email, name: APP_NAME, subject: 'Tu código para LUCAS EVOLUCIONA: ' + code,
    htmlBody: '<div style="font-family:Arial;background:#05060f;color:#e9f4ff;padding:30px;border-radius:16px;text-align:center">' +
      '<h1 style="color:#17ff5f;letter-spacing:3px">LUCAS EVOLUCIONA</h1><p>Tu código para cambiar la contraseña es:</p>' +
      '<div style="font-size:38px;font-weight:bold;letter-spacing:10px;color:#22e4ff">' + code + '</div>' +
      '<p style="color:#8aa0bf">Caduca en 15 minutos. Si no lo has pedido tú, ignora este correo.</p></div>'
  });
  return {};
}
function restablecer_(p) {
  var email = limpiaEmail_(p.email), pass = String(p.pass || '');
  freno_('res_' + email, 8, 1800);
  var code = CacheService.getScriptCache().get('rec_' + email);
  if (!code || code !== String(p.codigo || '').trim()) throw new Error('Código incorrecto o caducado');
  if (pass.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
  return lockU_(function () {
    var f = usuarios_(), i = buscar_(f.rows, U.Email, email);
    if (i < 0) throw new Error('Cuenta no encontrada');
    var sal = Utilities.getUuid();
    f.rows[i][U.Sal] = sal; f.rows[i][U.Hash] = sha_(sal + pass);
    CacheService.getScriptCache().remove('rec_' + email);
    return nuevaSesion_(f.sh, i, f.rows[i]);
  });
}

/* ═════════════════ PARTIDAS Y RANKING ═════════════════ */

var P_CAB = ['Fecha', 'Día', 'Email', 'Jugador', 'Puntos', 'Nivel máx', 'Fusiones', 'Combo máx', 'Segundos', 'Id', 'Modo', 'Pareja'];
function partidasSh_() {
  var sh = hoja_('Partidas', P_CAB);
  if (sh.getLastColumn() < P_CAB.length) sh.getRange(1, 1, 1, P_CAB.length).setValues([P_CAB]).setFontWeight('bold').setBackground('#0b1328').setFontColor('#17ff5f');
  return sh;
}

function partida_(p) {
  var u = sesion_(p.ses);
  var pts = Math.max(0, Math.round(Number(p.puntos) || 0)), niv = Math.max(0, Math.min(11, Math.round(Number(p.nivel) || 0)));
  var fus = Math.max(0, Math.round(Number(p.fusiones) || 0)), combo = Math.max(0, Math.round(Number(p.combo) || 0));
  var seg = Math.max(0, Math.round(Number(p.seg) || 0)), id = String(p.id || '').slice(0, 40);
  var dobles = p.modo === 'dobles', pareja = String(p.pareja || '').replace(/[<>"]/g, '').slice(0, 40);
  if (pts > 5000000) err_('Puntuación no válida');
  if (pts > 0 && seg < 3) err_('Partida demasiado corta');
  freno_('par_' + u.email, 40, 600);
  return lockU_(function () {
    if (id && CacheService.getScriptCache().get('pid_' + id)) return { repetida: true, user: pubUser_(u) };
    var f = usuarios_(), i = buscar_(f.rows, U.Email, u.email), row = f.rows[i];
    var hoy = hoy_(), ult = row[U.UltDia] instanceof Date ? hoy_(row[U.UltDia]) : String(row[U.UltDia] || '');
    var racha = Number(row[U.Racha] || 0);
    if (ult === hoy) { } else if (ult === ayer_()) racha++; else racha = 1;
    var antes = Number(row[U.Mejor] || 0), record = !dobles && pts > antes;
    row[U.Partidas] = Number(row[U.Partidas] || 0) + 1;
    if (!dobles) row[U.Mejor] = Math.max(antes, pts);
    row[U.Nivel] = Math.max(Number(row[U.Nivel] || 0), niv);
    row[U.Racha] = racha; row[U.RachaMax] = Math.max(Number(row[U.RachaMax] || 0), racha);
    row[U.UltDia] = "'" + hoy;
    guardaFila_(f.sh, i, row);
    row[U.UltDia] = hoy;
    partidasSh_().appendRow([new Date(), "'" + hoy, u.email, u.nombre, pts, niv, fus, combo, seg, id, dobles ? 'dobles' : 'solo', dobles ? pareja : '']);
    if (id) CacheService.getScriptCache().put('pid_' + id, '1', 21600);
    CacheService.getScriptCache().remove('rk_cache');
    var rk = rankings_();
    var pos = dobles ? rk.parejas.findIndex(function (x) { return x.n === pareja; }) + 1 : rk.hoy.findIndex(function (x) { return x.n === u.nombre; }) + 1;
    return { user: pubUser_(userObj_(row)), record: record, antes: antes, posHoy: pos, totalHoy: dobles ? rk.parejas.length : rk.hoyTotal, ranking: rk };
  });
}

function rankings_() {
  var c = CacheService.getScriptCache(), raw = c.get('rk_cache');
  if (raw) { try { return JSON.parse(raw); } catch (e) { } }
  var hoy = hoy_(), lunes = lunes_();
  var sh = partidasSh_(), n = sh.getLastRow(), desde = Math.max(2, n - 6000);
  var v = n > 1 ? sh.getRange(desde, 1, n - desde + 1, 12).getValues() : [];
  var bH = {}, bS = {}, bP = {};
  v.forEach(function (r) {
    var dia = r[1] instanceof Date ? hoy_(r[1]) : String(r[1]), nom = String(r[3]), pts = Number(r[4]) || 0, niv = Number(r[5]) || 0;
    if (r[10] === 'dobles') { var pj = String(r[11] || nom); if (!bP[pj] || bP[pj].p < pts) bP[pj] = { n: pj, p: pts, l: niv }; return; }
    if (dia >= lunes && (!bS[nom] || bS[nom].p < pts)) bS[nom] = { n: nom, p: pts, l: niv };
    if (dia === hoy && (!bH[nom] || bH[nom].p < pts)) bH[nom] = { n: nom, p: pts, l: niv };
  });
  var orden = function (o) { return Object.keys(o).map(function (k) { return o[k]; }).sort(function (a, b) { return b.p - a.p; }); };
  var hoyL = orden(bH), semL = orden(bS);
  var f = usuarios_();
  var tot = f.rows.filter(function (r) { return Number(r[U.Mejor]) > 0 && !r[U.Bloqueado]; })
    .map(function (r) { return { n: String(r[U.Nombre]), p: Number(r[U.Mejor]), l: Number(r[U.Nivel] || 0) }; })
    .sort(function (a, b) { return b.p - a.p; });
  var out = { hoy: hoyL.slice(0, 50), semana: semL.slice(0, 50), total: tot.slice(0, 50), parejas: orden(bP).slice(0, 50), hoyTotal: hoyL.length, dia: hoy };
  try { c.put('rk_cache', JSON.stringify(out), 60); } catch (e) { }
  return out;
}
function ranking_(p) { return { ranking: rankings_() }; }

/* ═════════════════ SALAS A DOBLES (solo emparejamiento; la partida va directa entre móviles) ═════════════════ */

function salaCrear_(p) {
  freno_('sala', 60, 600);
  var sdp = String(p.sdp || ''); if (sdp.length < 50 || sdp.length > 60000) throw new Error('Datos de conexión no válidos');
  var c = CacheService.getScriptCache(), abc = 'ABDEFGHJKLMNPQRSTUVWXYZ', code = '';
  for (var t = 0; t < 20; t++) { code = ''; for (var i = 0; i < 4; i++) code += abc[Math.floor(Math.random() * abc.length)]; if (!c.get('sala_' + code)) break; }
  c.put('sala_' + code, JSON.stringify({ o: sdp, hn: String(p.nombre || 'Jugador 1').replace(/[<>"]/g, '').slice(0, 16), a: '', gn: '' }), 900);
  return { code: code };
}
function sala_(code) {
  var raw = CacheService.getScriptCache().get('sala_' + String(code || '').toUpperCase().replace(/[^A-Z]/g, ''));
  if (!raw) throw new Error('Esa sala no existe o ha caducado');
  return JSON.parse(raw);
}
function salaVer_(p) {
  var s = sala_(p.code);
  if (p.rol === 'host') return { a: s.a, gn: s.gn };
  if (s.a) throw new Error('Esa sala ya está completa');
  return { o: s.o, hn: s.hn };
}
function salaUnir_(p) {
  freno_('salaU', 60, 600);
  var code = String(p.code || '').toUpperCase().replace(/[^A-Z]/g, ''), sdp = String(p.sdp || '');
  if (sdp.length < 50 || sdp.length > 60000) throw new Error('Datos de conexión no válidos');
  return lockU_(function () {
    var s = sala_(code);
    if (s.a) throw new Error('Esa sala ya está completa');
    s.a = sdp; s.gn = String(p.nombre || 'Jugador 2').replace(/[<>"]/g, '').slice(0, 16);
    CacheService.getScriptCache().put('sala_' + code, JSON.stringify(s), 900);
    return {};
  });
}

/* ═════════════════ PANEL ADMIN ═════════════════ */

function tokenAdmin_() {
  var t = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().slice(0, 8);
  CacheService.getScriptCache().put('adm_' + t, '1', 14400);
  return t;
}
function esAdminTk_(t) { return !!t && CacheService.getScriptCache().get('adm_' + t) === '1'; }
function llaves_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('llaves') || '[]'); } catch (e) { return []; } }
function compruebaLlave_(llave, ses) {
  llave = String(llave || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  if (llave.length < 6) throw new Error('Llave no válida');
  var list = llaves_(), h = sha_('lucasevo|' + llave);
  if (!list.length) {
    var esAdm = false; try { esAdm = sesion_(ses).email === ADMIN_EMAIL; } catch (e) { }
    if (!esAdm) throw new Error('Para registrar tu primera llave, inicia sesión antes con ' + ADMIN_EMAIL);
    list.push(h); PropertiesService.getScriptProperties().setProperty('llaves', JSON.stringify(list));
    return 'nueva';
  }
  if (list.indexOf(h) < 0) throw new Error('Esta llave no está autorizada');
  return 'ok';
}
function adminLlave_(p) {
  freno_('admllave', 10, 600);
  var r = compruebaLlave_(p.llave, p.ses);
  return { adm: tokenAdmin_(), nueva: r === 'nueva' };
}
function adminTotp_(p) {
  freno_('admtotp', 8, 600);
  var sec = PropertiesService.getScriptProperties().getProperty('totp');
  if (!sec) throw new Error('Google Authenticator aún no está configurado (actívalo desde el panel)');
  if (!totpOk_(sec, String(p.codigo || '').trim())) throw new Error('Código incorrecto');
  return { adm: tokenAdmin_() };
}
function b32bytes_(s) {
  var abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', bits = '', out = [];
  s.replace(/=+$/, '').toUpperCase().split('').forEach(function (ch) { var v = abc.indexOf(ch); if (v >= 0) bits += ('00000' + v.toString(2)).slice(-5); });
  for (var i = 0; i + 8 <= bits.length; i += 8) { var v = parseInt(bits.substr(i, 8), 2); out.push(v > 127 ? v - 256 : v); }
  return out;
}
function totpOk_(sec, code) {
  if (!/^\d{6}$/.test(code)) return false;
  var key = b32bytes_(sec), t = Math.floor(Date.now() / 30000);
  for (var d = -1; d <= 1; d++) {
    var c = t + d, msg = [];
    for (var i = 7; i >= 0; i--) { var v = c & 255; msg[i] = v > 127 ? v - 256 : v; c = Math.floor(c / 256); }
    var h = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_1, msg, key).map(function (b) { return b & 255; });
    var o = h[19] & 15;
    var n = (((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1000000;
    if (('000000' + n).slice(-6) === code) return true;
  }
  return false;
}

function admin_(p) {
  if (!esAdminTk_(p.adm)) throw new Error('ADMIN');
  var op = String(p.op || ''), d = p.d || {}, c = cfg_();
  if (op === 'resumen') {
    var f = usuarios_(), hoy = hoy_(), sh = partidasSh_(), n = sh.getLastRow();
    var ult = n > 1 ? sh.getRange(Math.max(2, n - 29), 1, Math.min(30, n - 1), 9).getValues().reverse() : [];
    var hoyN = 0;
    if (n > 1) sh.getRange(Math.max(2, n - 3000), 2, Math.min(3000, n - 1), 1).getValues().forEach(function (r) { if ((r[0] instanceof Date ? hoy_(r[0]) : String(r[0])) === hoy) hoyN++; });
    return {
      ajustes: c, partidasTotal: Math.max(0, n - 1), partidasHoy: hoyN,
      ultimas: ult.map(function (r) { return { f: r[0], j: r[3], p: r[4], l: r[5], s: r[8] }; }),
      usuarios: f.rows.map(function (r) { var u = userObj_(r); return { email: u.email, nombre: u.nombre, partidas: u.partidas, mejor: u.mejor, nivel: u.nivel, racha: u.racha, google: !!r[U.Google], bloq: u.bloqueado, ultimo: r[U.Ultimo] }; })
        .sort(function (a, b) { return b.mejor - a.mejor; }),
      llaves: llaves_().length, totp: !!PropertiesService.getScriptProperties().getProperty('totp')
    };
  }
  if (op === 'ajustes') {
    c.banner = String(d.banner || '').slice(0, 200);
    c.mant = !!d.mant;
    c.mantMsg = String(d.mantMsg || '').slice(0, 200) || AJUSTES_DEF.mantMsg;
    guardaCfg_(c); return { ajustes: c };
  }
  if (op === 'imgVer') { c.imgVer = Number(c.imgVer || 1) + 1; guardaCfg_(c); return { imgVer: c.imgVer }; }
  if (op === 'bloquear') {
    return lockU_(function () {
      var f = usuarios_(), i = buscar_(f.rows, U.Email, limpiaEmail_(d.email));
      if (i < 0) throw new Error('Usuario no encontrado');
      if (f.rows[i][U.Email] === ADMIN_EMAIL) throw new Error('No puedes bloquear al admin');
      f.sh.getRange(i + 2, U.Bloqueado + 1).setValue(d.bloq ? 'SI' : '');
      if (d.bloq) f.sh.getRange(i + 2, U.Tokens + 1).setValue('[]');
      CacheService.getScriptCache().remove('rk_cache');
      return {};
    });
  }
  if (op === 'totpNuevo') {
    var abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', s = '';
    for (var i = 0; i < 32; i++) s += abc[Math.floor(Math.random() * 32)];
    PropertiesService.getScriptProperties().setProperty('totp', s);
    return { secreto: s, url: 'otpauth://totp/LucasEvoluciona:admin?secret=' + s + '&issuer=LucasEvoluciona' };
  }
  if (op === 'totpQuitar') { PropertiesService.getScriptProperties().deleteProperty('totp'); return {}; }
  if (op === 'llavesBorrar') { PropertiesService.getScriptProperties().deleteProperty('llaves'); return {}; }
  throw new Error('Operación desconocida');
}

/* Ejecutar una vez desde el editor para crear las hojas y dar permisos */
function setupInicial() {
  usuarios_(); partidasSh_();
  Logger.log('Hojas listas en: ' + ss_().getUrl());
}
