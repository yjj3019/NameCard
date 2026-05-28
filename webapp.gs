// ══════════════════════════════════════════════
// webapp.gs — 서버 사이드 정밀 기기 라우팅 아키텍처
// ══════════════════════════════════════════════

// ── 인증 확인 및 다이내믹 라우팅 ────────────────
function doGet(e) {
  var user = Session.getActiveUser().getEmail();
  var scriptUrl = ScriptApp.getService().getUrl();

  if (!user) {
    var authUrl = 'https://accounts.google.com/ServiceLogin?continue=' +
      encodeURIComponent(scriptUrl);
    return HtmlService.createHtmlOutput(buildLoginPage(authUrl))
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  var role = getUserRole(user);
  if (!role) {
    return HtmlService.createHtmlOutput(buildDeniedPage(user))
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  var param = e && e.parameter ? e.parameter : {};

  // 1. 관리자 전용 페이지 라우팅 (보안 검증 후 전송)
  if (param.page === 'admin') {
    if (role === 'admin') {
      var template = HtmlService.createTemplateFromFile('admin');
      template.scriptUrl = scriptUrl;
      return template.evaluate()
        .setTitle('CardVault Pro — 사용자 관리')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    } else {
      return HtmlService.createHtmlOutput(buildDeniedPage(user))
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
  }

  // 2. 명시적 기기 뷰포트 파라미터 강제 매핑
  if (param.v === 'mobile') {
    var template = HtmlService.createTemplateFromFile('mobile');
    template.scriptUrl = scriptUrl;
    return template.evaluate()
      .setTitle('CardVault Pro (Mobile)')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  if (param.v === 'desktop') {
    var template = HtmlService.createTemplateFromFile('index');
    template.scriptUrl = scriptUrl;
    return template.evaluate()
      .setTitle('CardVault Pro (Desktop)')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  // 3. 파라미터가 아예 없을 때 (최초 접속): 클라이언트 사이드 디스패처로 최상위 프레임 리다이렉트 유도
  return HtmlService.createHtmlOutput(buildRouterPage(scriptUrl))
    .setTitle('CardVault Pro — 연결 중')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * 최초 접속 시 모바일과 데스크톱을 100% 무결하게 감지하여 최상위 프레임 주소를 새로 갱신하는 디스패처 셸
 */
function buildRouterPage(scriptUrl) {
  return '<!DOCTYPE html>' +
    '<html><head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>' +
    'body{background:#0a0a0c;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;gap:16px;}' +
    '.s{width:36px;height:36px;border:3px solid #1c1c25;border-top-color:#c9a84c;border-radius:50%;animation:spin .8s cubic-bezier(0.4, 0, 0.2, 1) infinite;}' +
    '@keyframes spin{to{transform:rotate(360deg);}}' +
    '.t{color:#9e9a92;font-size:13px;letter-spacing:0.5px;font-weight:500;}</style></head><body>' +
    '<div class="s"></div><div class="t">디바이스 최적화 화면 구성 중...</div>' +
    '<script>' +
    '(function() {' +
    '  var scriptUrl = "' + scriptUrl + '";' +
    '  var targetView = "desktop";' +
    '  try {' +
    '    var manualView = localStorage.getItem("cv_manual_view");' +
    '    if (manualView === "desktop" || manualView === "mobile") {' +
    '      targetView = manualView;' +
    '    } else {' +
    '      var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);' +
    '      targetView = isMobile ? "mobile" : "desktop";' +
    '    }' +
    '  } catch(e) {' +
    '    var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);' +
    '    targetView = isMobile ? "mobile" : "desktop";' +
    '  }' +
    '  try {' +
    '    if (window.top && window.top !== window) {' +
    '      window.top.location.href = scriptUrl + "?v=" + targetView;' +
    '    } else {' +
    '      window.location.href = scriptUrl + "?v=" + targetView;' +
    '    }' +
    '  } catch(e) {' +
    '    window.location.href = scriptUrl + "?v=" + targetView;' +
    '  }' +
    '})();' +
    '<\/script></body></html>';
}

function buildLoginPage(authUrl) {
  return '<!DOCTYPE html>' +
    '<html><head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600&display=swap" rel="stylesheet">' +
    '<style>' +
    'body{background:#0a0a0c;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:"DM Sans",sans-serif;}' +
    '.box{text-align:center;padding:48px 40px;background:#111116;border:1px solid rgba(255,255,255,.07);border-radius:24px;max-width:360px;width:90%;}' +
    '.logo{font-family:"DM Serif Display",serif;font-size:28px;background:linear-gradient(135deg,#f0ede8,#c9a84c);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:4px;}' +
    '.badge{font-size:10px;color:#c9a84c;letter-spacing:2px;margin-bottom:32px;display:block;}' +
    '.icon{font-size:48px;margin-bottom:16px;}' +
    '.title{color:#f0ede8;font-size:18px;font-weight:600;margin-bottom:8px;}' +
    '.sub{color:#5e5b55;font-size:13px;margin-bottom:28px;line-height:1.6;}' +
    '.btn{display:flex;align-items:center;justify-content:center;gap:10px;padding:14px 24px;background:linear-gradient(135deg,#c9a84c,#9a7530);color:#0a0a0c;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;}' +
    '.g-icon{width:20px;height:20px;background:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#0a0a0c;}' +
    '</style></head><body>' +
    '<div class="box">' +
    '<div class="logo">CardVault</div>' +
    '<span class="badge">PRO</span>' +
    '<div class="icon">🔐</div>' +
    '<div class="title">로그인이 필요합니다</div>' +
    '<div class="sub">Google 계정으로 로그인하여<br>명함 관리를 시작하세요</div>' +
    '<a class="btn" href="' + authUrl + '">' +
    '<div class="g-icon">G</div>Google로 계속하기' +
    '</a></div>' +
    '</body></html>';
}

function buildDeniedPage(email) {
  return '<!DOCTYPE html>' +
    '<html><head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600&display=swap" rel="stylesheet">' +
    '<style>' +
    'body{background:#0a0a0c;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:"DM Sans",sans-serif;}' +
    '.box{text-align:center;padding:48px 40px;background:#111116;border:1px solid rgba(255,255,255,.07);border-radius:24px;max-width:360px;width:90%;}' +
    '.logo{font-family:"DM Serif Display",serif;font-size:28px;background:linear-gradient(135deg,#f0ede8,#c9a84c);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:4px;}' +
    '.badge{font-size:10px;color:#c9a84c;letter-spacing:2px;margin-bottom:32px;display:block;}' +
    '.icon{font-size:48px;margin-bottom:16px;}' +
    '.title{color:#f0ede8;font-size:18px;font-weight:600;margin-bottom:8px;}' +
    '.email{color:#c9a84c;font-size:13px;margin-bottom:8px;word-break:break-all;}' +
    '.sub{color:#5e5b55;font-size:13px;line-height:1.6;}' +
    '</style></head><body>' +
    '<div class="box">' +
    '<div class="logo">CardVault</div>' +
    '<span class="badge">PRO</span>' +
    '<div class="icon">🚫</div>' +
    '<div class="title">접근 권한이 없습니다</div>' +
    '<div class="email">' + email + '</div>' +
    '<div class="sub">관리자에게 접근 권한을<br>요청하세요</div>' +
    '</div>' +
    '</body></html>';
}

// ── 사용자 관리 ─────────────────────────────────
function getUserRole(email) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('allowed_users');
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === email) return data[i][2];
  }
  return null;
}

function getCurrentUser() {
  var email = Session.getActiveUser().getEmail();
  var role = getUserRole(email);
  return { email: email, role: role };
}

function getUsers() {
  var cur = getCurrentUser();
  if (cur.role !== 'admin') throw new Error('권한 없음');
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('allowed_users');
  var data = sheet.getDataRange().getValues();
  return data.slice(1).map(function(row, i) {
    return {
      index:     i + 2,
      email:     row[0],
      name:      row[1],
      role:      row[2],
      createdAt: row[3]
    };
  });
}

function addUser(email, name, role) {
  var cur = getCurrentUser();
  if (cur.role !== 'admin') throw new Error('권한 없음');
  if (!email || email.indexOf('@') === -1) throw new Error('유효하지 않은 이메일');

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('allowed_users');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === email) throw new Error('이미 등록된 이메일: ' + email);
  }
  sheet.appendRow([email, name || '', role || 'user', new Date().toISOString()]);
  return { success: true };
}

function removeUser(rowIndex) {
  var cur = getCurrentUser();
  if (cur.role !== 'admin') throw new Error('권한 없음');
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('allowed_users');
  var targetEmail = sheet.getRange(rowIndex, 1).getValue();
  if (targetEmail === cur.email) throw new Error('본인 계정은 삭제할 수 없습니다');
  sheet.deleteRow(rowIndex);
  return { success: true };
}

function updateUserRole(rowIndex, newRole) {
  var cur = getCurrentUser();
  if (cur.role !== 'admin') throw new Error('권한 없음');
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('allowed_users');
  sheet.getRange(rowIndex, 3).setValue(newRole);
  return { success: true };
}

// ── 명함 데이터 ─────────────────────────────────
function getNamecards() {
  var cur = getCurrentUser();
  if (!cur.role) throw new Error('권한 없음');
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('db_namecards');
  var data = sheet.getDataRange().getValues();
  return data.slice(1).map(function(row, i) {
    return {
      index:     i + 2,
      id:        row[0],
      createdAt: row[1],
      company:   row[2],
      name:      row[3],
      title:     row[4],
      phone:     row[5],
      mobile:    row[6],
      email:     row[7],
      address:   row[8],
      imageUrl:  row[9],
      status:    row[10]
    };
  }).filter(function(r) { return r.name || r.company; });
}

function getLastUpdated() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('db_namecards');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return '';
  return sheet.getRange(lastRow, 2).getValue().toString();
}

function deleteNamecard(rowIndex) {
  var cur = getCurrentUser();
  if (!cur.role) throw new Error('권한 없음');
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('db_namecards');
  sheet.deleteRow(rowIndex);
  return { success: true };
}

function updateNamecard(rowIndex, data) {
  var cur = getCurrentUser();
  if (!cur.role) throw new Error('권한 없음');
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('db_namecards');
  sheet.getRange(rowIndex, 3, 1, 7).setValues([[
    data.company, data.name,   data.title,
    data.phone,   data.mobile, data.email, data.address
  ]]);
  return { success: true };
}

function uploadToDrive(base64Data, mimeType, fileName) {
  var cur = getCurrentUser();
  if (!cur.role) throw new Error('권한 없음');
  var config = getActiveConfig();
  var folder = getDriveFolder(config.FOLDER_NAME);
  if (!folder) throw new Error(config.FOLDER_NAME + ' 폴더를 찾을 수 없습니다');
  var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { success: true, fileId: file.getId() };
}

// ── 시스템 환경설정 제어 ────────────────────────────
function getSystemConfigs() {
  var cur = getCurrentUser();
  if (cur.role !== 'admin') throw new Error('권한 없음');
  
  var props = PropertiesService.getScriptProperties().getProperties();
  return {
    GEMINI_API_KEY: props.GEMINI_API_KEY || '',
    GEMINI_MODEL: props.GEMINI_MODEL || 'gemini-3.1-flash-lite',
    FOLDER_NAME: props.FOLDER_NAME || 'Namecard_Images',
    DONE_FOLDER: props.DONE_FOLDER || 'Namecard_Done'
  };
}

function saveSystemConfigs(settings) {
  var cur = getCurrentUser();
  if (cur.role !== 'admin') throw new Error('권한 없음');
  
  PropertiesService.getScriptProperties().setProperties({
    GEMINI_API_KEY: settings.GEMINI_API_KEY,
    GEMINI_MODEL: settings.GEMINI_MODEL,
    FOLDER_NAME: settings.FOLDER_NAME,
    DONE_FOLDER: settings.DONE_FOLDER
  });
  return { success: true };
}
