function initSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 기존 시트들
  let sheet = ss.getSheetByName('db_namecards');
  if (!sheet) sheet = ss.insertSheet('db_namecards');
  const HEADERS = ['ID','생성일시','회사명','이름','직책','전화번호','휴대폰','이메일','주소','명함이미지링크','처리상태'];
  sheet.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);

  let logSheet = ss.getSheetByName('processed_log');
  if (!logSheet) {
    logSheet = ss.insertSheet('processed_log');
    logSheet.getRange(1,1,1,2).setValues([['fileId','processedAt']]);
  }

  // 사용자 관리 시트 추가
  let userSheet = ss.getSheetByName('allowed_users');
  if (!userSheet) {
    userSheet = ss.insertSheet('allowed_users');
    userSheet.getRange(1,1,1,4).setValues([['이메일','이름','역할','등록일시']]);
    userSheet.setFrozenRows(1);
    // 관리자 본인 자동 등록
    const adminEmail = Session.getActiveUser().getEmail();
    userSheet.appendRow([adminEmail, '관리자', 'admin', new Date().toISOString()]);
  }

  Logger.log('✅ 초기화 완료');
}
