// ══════════════════════════════════════════════
// webapp.gs — 스마트 라우팅 및 관계형 데이터 조인 모델
// ══════════════════════════════════════════════

function doGet(e) {
  var user = Session.getActiveUser().getEmail();
  var scriptUrl = ScriptApp.getService().getUrl();

  if (!user) {
    var authUrl = 'https://accounts.google.com/ServiceLogin?continue=' + encodeURIComponent(scriptUrl);
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

  if (param.page === 'admin') {
    if (role === 'admin') {
      var template = HtmlService.createTemplateFromFile('admin');
      template.scriptUrl = scriptUrl;
      return template.evaluate()
        .setTitle('CardVault Pro — 시스템 관리자 설정')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    } else {
      return HtmlService.createHtmlOutput(buildDeniedPage(user))
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
  }

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

  return HtmlService.createHtmlOutput(buildRouterPage(scriptUrl))
    .setTitle('CardVault Pro — 연결 중')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function buildRouterPage(scriptUrl) {
  return '<!DOCTYPE html>' +
    '<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{background:#0a0a0c;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;gap:16px;}.s{width:36px;height:36px;border:3px solid #1c1c25;border-top-color:#c9a84c;border-radius:50%;animation:spin .8s cubic-bezier(0.4,0,0.2,1) infinite;}@keyframes spin{to{transform:rotate(360deg);}}.t{color:#9e9a92;font-size:13px;letter-spacing:0.5px;font-weight:500;}</style></head><body>' +
    '<div class="s"></div><div class="t">디바이스 최적화 화면 구성 중...</div>' +
    '<script>(function(){var scriptUrl="'+scriptUrl+'";var targetView="desktop";try{var manualView=localStorage.getItem("cv_manual_view");if(manualView==="desktop"||manualView==="mobile"){targetView=manualView;}else{var isMobile=/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);targetView=isMobile?"mobile":"desktop";}}catch(e){var isMobile=/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);targetView=isMobile?"mobile":"desktop";}try{if(window.top&&window.top!==window){window.top.location.href=scriptUrl+"?v="+targetView;}else{window.location.href=scriptUrl+"?v="+targetView;}}catch(e){window.location.href=scriptUrl+"?v="+targetView;}})();<\/script></body></html>';
}

function buildLoginPage(authUrl) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600&display=swap" rel="stylesheet"><style>body{background:#0a0a0c;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:"DM Sans",sans-serif;}.box{text-align:center;padding:48px 40px;background:#111116;border:1px solid rgba(255,255,255,.07);border-radius:24px;max-width:360px;width:90%;}.logo{font-family:"DM Serif Display",serif;font-size:28px;background:linear-gradient(135deg,#f0ede8,#c9a84c);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:4px;}.badge{font-size:10px;color:#c9a84c;letter-spacing:2px;margin-bottom:32px;display:block;}.icon{font-size:48px;margin-bottom:16px;}.title{color:#f0ede8;font-size:18px;font-weight:600;margin-bottom:8px;}.sub{color:#5e5b55;font-size:13px;margin-bottom:28px;line-height:1.6;}.btn{display:flex;align-items:center;justify-content:center;gap:10px;padding:14px 24px;background:linear-gradient(135deg,#c9a84c,#9a7530);color:#0a0a0c;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;}.g-icon{width:20px;height:20px;background:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#0a0a0c;}</style></head><body><div class="box"><div class="logo">CardVault</div><span class="badge">PRO</span><div class="icon">🔐</div><div class="title">로그인이 필요합니다</div><div class="sub">Google 계정으로 로그인하여<br>명함 관리를 시작하세요</div><a class="btn" href="'+authUrl+'"><div class="g-icon">G</div>Google로 계속하기</a></div></body></html>';
}

function buildDeniedPage(email) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600&display=swap" rel="stylesheet"><style>body{background:#0a0a0c;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:"DM Sans",sans-serif;}.box{text-align:center;padding:48px 40px;background:#111116;border:1px solid rgba(255,255,255,.07);border-radius:24px;max-width:360px;width:90%;}.logo{font-family:"DM Serif Display",serif;font-size:28px;background:linear-gradient(135deg,#f0ede8,#c9a84c);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:4px;}.badge{font-size:10px;color:#c9a84c;letter-spacing:2px;margin-bottom:32px;display:block;}.icon{font-size:48px;margin-bottom:16px;}.title{color:#f0ede8;font-size:18px;font-weight:600;margin-bottom:8px;}.email{color:#c9a84c;font-size:13px;margin-bottom:8px;word-break:break-all;}.sub{color:#5e5b55;font-size:13px;line-height:1.6;}</style></head><body><div class="box"><div class="logo">CardVault</div><span class="badge">PRO</span><div class="icon">🚫</div><div class="title">접근 권한이 없습니다</div><div class="email">'+email+'</div><div class="sub">관리자에게 접근 권한을<br>요청하세요</div></div></body></html>';
}

function getUserRole(email) {
  if (!email) return null;
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
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  return data.slice(1).map(function(row, i) {
    return { 
      index: i + 2, 
      email: String(row[0] || ''), 
      name: String(row[1] || ''), 
      role: String(row[2] || ''), 
      createdAt: row[3] instanceof Date ? row[3].toISOString() : String(row[3] || '') 
    };
  });
}

function addUser(email, name, role) {
  var cur = getCurrentUser();
  if (cur.role !== 'admin') throw new Error('권한 없음');
  if (!email || email.indexOf('@') === -1) throw new Error('유효하지 않은 이메일');
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('allowed_users');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) { if (data[i][0] === email) throw new Error('이미 등록된 이메일: ' + email); }
  sheet.appendRow([sanitizeCell_(email), sanitizeCell_(name || ''), sanitizeCell_(role || 'user'), new Date().toISOString()]);
  return { success: true };
}

function removeUser(rowIndex, expectedEmail) {
  var cur = getCurrentUser();
  if (cur.role !== 'admin') throw new Error('권한 없음');
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('allowed_users');
  if (rowIndex < 2 || rowIndex > sheet.getLastRow()) throw new Error('목록이 변경되었습니다. 새로고침 후 다시 시도해 주세요.');
  var targetEmail = sheet.getRange(rowIndex, 1).getValue();
  if (expectedEmail && String(targetEmail) !== String(expectedEmail)) throw new Error('목록이 변경되었습니다. 새로고침 후 다시 시도해 주세요.');
  if (targetEmail === cur.email) throw new Error('본인 계정은 삭제할 수 없습니다');
  sheet.deleteRow(rowIndex);
  return { success: true };
}

function updateUserRole(rowIndex, newRole, expectedEmail) {
  var cur = getCurrentUser();
  if (cur.role !== 'admin') throw new Error('권한 없음');
  if (newRole !== 'admin' && newRole !== 'user') throw new Error('잘못된 역할 값입니다');
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('allowed_users');
  if (rowIndex < 2 || rowIndex > sheet.getLastRow()) throw new Error('목록이 변경되었습니다. 새로고침 후 다시 시도해 주세요.');
  if (expectedEmail && String(sheet.getRange(rowIndex, 1).getValue()) !== String(expectedEmail)) throw new Error('목록이 변경되었습니다. 새로고침 후 다시 시도해 주세요.');
  sheet.getRange(rowIndex, 3).setValue(newRole);
  return { success: true };
}

// ── 데이터베이스 조인 및 스마트 정렬 API (타입 캐스팅 무결성 보장) ─────────
function getNamecards() {
  var cur = getCurrentUser();
  if (!cur.role) throw new Error('권한 없음');
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('db_namecards');
  if (!sheet) return []; // 시트 누락 시 빈 배열 반환 보호
  
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; // 데이터가 아예 없는 경우 보호
  
  var careerSheet = ss.getSheetByName('db_careers');
  var careerData = careerSheet ? careerSheet.getDataRange().getValues() : [];
  var historyMap = {};
  
  if (careerData.length > 1) {
    for (var j = 1; j < careerData.length; j++) {
      var cName = String(careerData[j][0] || '').trim();
      var cMobile = String(careerData[j][1] || '').replace(/[^0-9]/g, '');
      var mapKey = cName + '_' + cMobile; 
      
      if (!historyMap[mapKey]) historyMap[mapKey] = [];
      historyMap[mapKey].push({
        oldCompany: String(careerData[j][2] || ''),
        oldTitle: String(careerData[j][3] || ''),
        newCompany: String(careerData[j][4] || ''),
        newTitle: String(careerData[j][5] || ''),
        date: careerData[j][6] instanceof Date ? careerData[j][6].toISOString() : String(careerData[j][6] || '')
      });
    }
  }

  // [버그 패치] 모든 필드에 확실한 String 캐스팅을 적용하여 JSON 직렬화 크래시 및 프론트엔드 에러 원천 차단
  var result = data.slice(1).map(function(row, i) {
    var rawName = String(row[3] || '').trim();
    var rawMobile = String(row[6] || '').replace(/[^0-9]/g, '');
    var key = rawName + '_' + rawMobile;
    
    var myHistory = historyMap[key] || [];
    myHistory.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });

    return {
      index:     i + 2,
      id:        String(row[0] || ''),
      createdAt: row[1] instanceof Date ? row[1].toISOString() : String(row[1] || ''),
      company:   String(row[2] || ''),
      name:      String(row[3] || ''),
      title:     String(row[4] || ''),
      phone:     String(row[5] || ''),
      mobile:    String(row[6] || ''),
      email:     String(row[7] || ''),
      address:   String(row[8] || ''),
      imageUrl:  String(row[9] || ''),
      status:    String(row[10] || ''),
      history:   myHistory
    };
  }).filter(function(r) { return r.name !== '' || r.company !== ''; });
  
  return result.reverse(); 
}

function getLastUpdated() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('db_namecards');
  if (!sheet) return '';
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return '';
  
  var val = sheet.getRange(lastRow, 2).getValue();
  return val instanceof Date ? val.toISOString() : String(val || '');
}

function deleteNamecard(rowIndex, expectedId) {
  var cur = getCurrentUser();
  if (cur.role !== 'admin') throw new Error('권한 없음');
  if (!expectedId) throw new Error('잘못된 요청입니다(expectedId 누락). 새로고침 후 다시 시도해 주세요.');
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('db_namecards');
  if (rowIndex < 2 || rowIndex > sheet.getLastRow() || String(sheet.getRange(rowIndex, 1).getValue() || '') !== String(expectedId)) throw new Error('목록이 변경되었습니다. 새로고침 후 다시 시도해 주세요.');
  sheet.deleteRow(rowIndex);
  return { success: true };
}

function updateNamecard(rowIndex, data, expectedId) {
  var cur = getCurrentUser();
  if (cur.role !== 'admin') throw new Error('권한 없음');
  if (!expectedId) throw new Error('잘못된 요청입니다(expectedId 누락). 새로고침 후 다시 시도해 주세요.');
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('db_namecards');
  if (rowIndex < 2 || rowIndex > sheet.getLastRow() || String(sheet.getRange(rowIndex, 1).getValue() || '') !== String(expectedId)) throw new Error('목록이 변경되었습니다. 새로고침 후 다시 시도해 주세요.');
  sheet.getRange(rowIndex, 3, 1, 7).setValues([[
    sanitizeCell_(data.company), sanitizeCell_(data.name), sanitizeCell_(data.title), sanitizeCell_(data.phone), sanitizeCell_(data.mobile), sanitizeCell_(data.email), sanitizeCell_(data.address)
  ]]);
  return { success: true };
}

function uploadToDrive(base64Data, mimeType, fileName) {
  var cur = getCurrentUser();
  if (cur.role !== 'admin') throw new Error('권한 없음');
  if (!base64Data || typeof base64Data !== 'string') throw new Error('잘못된 이미지 데이터입니다');
  var ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
  if (ALLOWED_MIME.indexOf(mimeType) === -1) throw new Error('허용되지 않은 파일 형식입니다: ' + mimeType);
  var approxBytes = Math.floor(base64Data.replace(/[^A-Za-z0-9+/=]/g, '').length * 3 / 4);
  if (approxBytes > 15 * 1024 * 1024) throw new Error('파일 크기가 너무 큽니다(최대 15MB)');

  var props = PropertiesService.getScriptProperties().getProperties();
  var folderName = (props.FOLDER_NAME || 'Namecard_Images').trim();

  var folders = DriveApp.getFoldersByName(folderName);
  var folder = folders.hasNext() ? folders.next() : null;
  if (!folder) throw new Error(folderName + ' 폴더를 찾을 수 없습니다');

  var safeFileName = String(fileName || ('namecard_' + Utilities.getUuid())).replace(/[\/\\:*?"<>|]/g, '_').slice(0, 150);
  var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, safeFileName);
  var file = folder.createFile(blob);
  /* SECURITY: no public link. Images are served only via getNamecardImage() after a role check. */
  
  // 렌더링 퍼포먼스 극대화를 위한 직접 뷰어(핫링크) URL 반환
  var directUrl = 'https://drive.google.com/uc?export=view&id=' + file.getId();
  /* OCR: scanNewNamecards trigger handles it */ return { success: true, fileId: file.getId(), directUrl: directUrl };
}

function getNamecardImage(ref) {
  var cur = getCurrentUser();
  if (!cur.role) throw new Error('권한 없음');
  var m = String(ref || '').match(/[-\w]{25,}/);
  if (!m) throw new Error('잘못된 요청');
  var props = PropertiesService.getScriptProperties().getProperties();
  var names = [(props.FOLDER_NAME || 'Namecard_Images').trim(), (props.DONE_FOLDER || 'Namecard_Done').trim()];
  var allowedIds = {};
  for (var n = 0; n < names.length; n++) {
    var it = DriveApp.getFoldersByName(names[n]);
    while (it.hasNext()) { allowedIds[it.next().getId()] = true; }
  }
  var file = DriveApp.getFileById(m[0]);
  var ok = false, ps = file.getParents();
  while (ps.hasNext()) { if (allowedIds[ps.next().getId()]) { ok = true; break; } }
  if (!ok) throw new Error('허용되지 않은 파일');
  var blob = file.getBlob();
  return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
}

function getSystemConfigs() {
  var cur = getCurrentUser();
  if (cur.role !== 'admin') throw new Error('권한 없음');
  var props = PropertiesService.getScriptProperties().getProperties();
  return {
    GEMINI_API_KEY: props.GEMINI_API_KEY ? '********' : '', // 실제 키는 클라이언트로 전송하지 않음
    GEMINI_MODEL: props.GEMINI_MODEL || 'gemini-3.1-flash-lite',
    FOLDER_NAME: props.FOLDER_NAME || 'Namecard_Images',
    DONE_FOLDER: props.DONE_FOLDER || 'Namecard_Done'
  };
}

function saveSystemConfigs(settings) {
  var cur = getCurrentUser();
  if (cur.role !== 'admin') throw new Error('권한 없음');
  PropertiesService.getScriptProperties().setProperties({
    GEMINI_API_KEY: (!settings.GEMINI_API_KEY || settings.GEMINI_API_KEY === '********') ? (PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || '') : String(settings.GEMINI_API_KEY).trim(),
    GEMINI_MODEL: settings.GEMINI_MODEL,
    FOLDER_NAME: settings.FOLDER_NAME,
    DONE_FOLDER: settings.DONE_FOLDER
  });
  return { success: true };
}