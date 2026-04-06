#!/usr/bin/env node
/**
 * 修复 Windows 快捷方式图标问题
 * 在 Tauri 构建后运行，确保快捷方式使用高清图标
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const RELEASE_DIR = path.join(PROJECT_ROOT, 'src-tauri', 'target', 'release');
const NSIS_DIR = path.join(RELEASE_DIR, 'nsis', 'x64');
const INSTALLER_NSI = path.join(NSIS_DIR, 'installer.nsi');
const ICON_SOURCE = path.join(PROJECT_ROOT, 'src-tauri', 'icons', 'icon.ico');
const ICON_DEST = path.join(RELEASE_DIR, 'icon.ico');

function log(message) {
  console.log(`[fix-shortcut-icon] ${message}`);
}

function fixNsisScript() {
  if (!fs.existsSync(INSTALLER_NSI)) {
    log('❌ 未找到 NSIS 脚本，跳过修复');
    return false;
  }

  let content = fs.readFileSync(INSTALLER_NSI, 'utf-8');
  let modified = false;

  // 1. 修复快捷方式图标路径
  const shortcutPatterns = [
    { 
      old: /CreateShortcut "\$SMPROGRAMS\\\$AppStartMenuFolder\\\$\{PRODUCTNAME\}\.lnk" "\$INSTDIR\\\$\{MAINBINARYNAME\}\.exe"/,
      new: 'CreateShortcut "$SMPROGRAMS\\$AppStartMenuFolder\\${PRODUCTNAME}.lnk" "$INSTDIR\\${MAINBINARYNAME}.exe" "" "$INSTDIR\\icon.ico" 0'
    },
    { 
      old: /CreateShortcut "\$SMPROGRAMS\\\$\{PRODUCTNAME\}\.lnk" "\$INSTDIR\\\$\{MAINBINARYNAME\}\.exe"/,
      new: 'CreateShortcut "$SMPROGRAMS\\${PRODUCTNAME}.lnk" "$INSTDIR\\${MAINBINARYNAME}.exe" "" "$INSTDIR\\icon.ico" 0'
    },
    { 
      old: /CreateShortcut "\$DESKTOP\\\$\{PRODUCTNAME\}\.lnk" "\$INSTDIR\\\$\{MAINBINARYNAME\}\.exe"/,
      new: 'CreateShortcut "$DESKTOP\\${PRODUCTNAME}.lnk" "$INSTDIR\\${MAINBINARYNAME}.exe" "" "$INSTDIR\\icon.ico" 0'
    }
  ];

  for (const { old, new: replacement } of shortcutPatterns) {
    if (old.test(content) && !content.includes('$INSTDIR\\icon.ico" 0')) {
      content = content.replace(old, replacement);
      modified = true;
    }
  }

  // 2. 添加 icon.ico 复制指令（NSIS脚本在 nsis/x64/ 目录，需要返回3级到 release 目录）
  const copyIconPattern = /(File "\$\{MAINBINARYSRCPATH\}")/;
  const copyIconReplacement = '$1\n\n  ; Copy icon file for shortcuts\n  File "..\\..\\..\\icon.ico"';
  
  if (copyIconPattern.test(content) && !content.includes('Copy icon file for shortcuts')) {
    content = content.replace(copyIconPattern, copyIconReplacement);
    modified = true;
  }

  // 3. 添加 icon.ico 删除指令
  const deletePattern = /(Delete "\$INSTDIR\\\$\{MAINBINARYNAME\}\.exe")/;
  const deleteReplacement = '$1\n  Delete "$INSTDIR\\icon.ico"';
  
  if (deletePattern.test(content) && !content.includes('Delete "$INSTDIR\\icon.ico"')) {
    content = content.replace(deletePattern, deleteReplacement);
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(INSTALLER_NSI, content, 'utf-8');
    log('✅ NSIS 脚本已修复');
    return true;
  } else {
    log('ℹ️ NSIS 脚本无需修改');
    return true;
  }
}

function copyIconFile() {
  if (!fs.existsSync(ICON_SOURCE)) {
    log(`❌ 源图标不存在: ${ICON_SOURCE}`);
    return false;
  }

  fs.copyFileSync(ICON_SOURCE, ICON_DEST);
  log(`✅ 图标已复制到: ${ICON_DEST}`);
  return true;
}

function repackNsis() {
  const nsisPath = process.env.NSIS_PATH || findNsis();
  if (!nsisPath) {
    log('❌ 未找到 makensis，跳过重新打包');
    return false;
  }

  try {
    execSync(`"${nsisPath}" "${INSTALLER_NSI}"`, { stdio: 'inherit' });
    
    // 复制到 bundle 目录
    const outputExe = path.join(NSIS_DIR, 'nsis-output.exe');
    const bundleDir = path.join(RELEASE_DIR, 'bundle', 'nsis');
    const bundleExe = path.join(bundleDir, 'EasyLingo_1.0.0_x64-setup.exe');
    
    if (fs.existsSync(outputExe)) {
      fs.mkdirSync(bundleDir, { recursive: true });
      fs.copyFileSync(outputExe, bundleExe);
      log(`✅ 安装程序已更新: ${bundleExe}`);
      return true;
    }
  } catch (error) {
    log(`❌ 重新打包失败: ${error.message}`);
    return false;
  }
}

function findNsis() {
  const possiblePaths = [
    path.join(process.env.LOCALAPPDATA || '', 'tauri', 'NSIS', 'Bin', 'makensis.exe'),
    path.join(process.env.PROGRAMFILES || '', 'NSIS', 'makensis.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'NSIS', 'makensis.exe'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

function main() {
  log('开始修复快捷方式图标...');

  // 检查文件是否存在
  if (!fs.existsSync(INSTALLER_NSI)) {
    log(`❌ NSIS 脚本不存在: ${INSTALLER_NSI}`);
    log('请先运行: npm run tauri build');
    process.exit(1);
  }

  // 1. 复制图标文件
  if (!copyIconFile()) {
    process.exit(1);
  }

  // 2. 修复 NSIS 脚本
  if (!fixNsisScript()) {
    process.exit(1);
  }

  // 3. 重新打包
  if (!repackNsis()) {
    process.exit(1);
  }

  log('✅ 所有修复已完成！');
}

main();
