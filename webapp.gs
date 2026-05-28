// ══════════════════════════════════════════════
// webapp.gs — 최적화 라우팅 및 기기 격리 적용
// ══════════════════════════════════════════════

// ── 인증 확인 및 다이내믹 라우팅 ────────────────
function doGet(e) {
  var user = Session.getActiveUser().getEmail();
  var scriptUrl = ScriptApp.getService().getUrl();

  if (!user) {
    var authUrl = 'https://accounts.google.com/ServiceLogin?continue=' +
      encodeURIComponent(scriptUrl);
    return HtmlService.createHtmlOutput(buildLoginPage(authUrl))
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  var role = getUserRole(user);
  if (!role) {
    return HtmlService.createHtmlOutput(buildDeniedPage(user))
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  var param = e && e.parameter ? e.parameter : {};

  // 1. 관리자 전용 페이지 라우팅
  if (param.page === 'admin' && role === 'admin') {
    return HtmlService.createHtmlOutputFromFile('admin')
      .setTitle('CardVault Pro — 사용자 관리')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // 2. 명시적 기기 뷰 파라미터가 있을 경우 세션 렌더링
  if (param.v === 'mobile') {
    return HtmlService.createHtmlOutputFromFile('mobile')
      .setTitle('CardVault Pro (Mobile)')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  if (param.v === 'desktop') {
    return HtmlService.createHtmlOutputFromFile('index')
      .setTitle('CardVault Pro (Desktop)')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // 3. 무조건적 라우터 페이지 전달 (로컬 클라이언트 상태 진단용)
  return HtmlService.createHtmlOutput(buildRouterPage(scriptUrl))
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ── 최적화 디바이스 분석기 빌더 ─────────────────────
function buildRouterPage(scriptUrl) {
  return '<!DOCTYPE html>' +
    '<html><head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>' +
    'body{background:#080809;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;gap:16px;}' +
    '.s{width:36px;height:36px;border:3px solid #1c1c25;border-top-color:#c9a84c;border-radius:50%;animation:spin .8s cubic-bezier(0.4, 0, 0.2, 1) infinite;}' +
    '@keyframes spin{to{transform:rotate(360deg);}}' +
    '.t{color:#5e5b55;font-size:12px;letter-spacing:1px;font-weight:500;}</style></head><body>' +
    '<div class="s"></div><div class="t">디바이스 환경 분석 중...</div>' +
    '<script>' +
    '(function() {' +
    '  var scriptUrl = "' + scriptUrl + '";' +
    '  var manualView = localStorage.getItem("cv_manual_view");' +
    '  if (manualView === "desktop" || manualView === "mobile") {' +
    '    window.location.replace(scriptUrl + "?v=" + manualView);' +
    '    return;' +
    '  }' +
    '  var isMobile = window.matchMedia("(max-width: 768px)").matches || ' +
    '                 /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|SamsungBrowser|Mobile/i.test(navigator.userAgent);' +
    '  var targetView = isMobile ? "mobile" : "desktop";' +
    '  window.location.replace(scriptUrl + "?v=" + targetView);' +
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
  var folder = getDriveFolder(CONFIG.FOLDER_NAME);
  if (!folder) throw new Error('Namecard_Images 폴더를 찾을 수 없습니다');
  var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { success: true, fileId: file.getId() };
}

// webapp.gs 에 추가할 환경설정 API
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
