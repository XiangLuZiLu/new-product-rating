// VPS backup dialog. No global dependencies on admin.js; files never leave browser until inspect/restore.
(() => {
  'use strict';
  const open = document.getElementById('backupManageBtn');
  if (!open) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'business-backup-dialog';
  dialog.setAttribute('aria-label', '数据备份与恢复');
  dialog.innerHTML = `
    <div class="backup-header"><strong>数据备份与恢复</strong><button class="backup-close" type="button" aria-label="关闭">×</button></div>
    <div class="backup-body">
      <section class="backup-section">
        <h3>1. 下载业务备份</h3>
        <p>包含款式配置、评分结果、评分链接和全部设置，不包含本地图片文件。文件以密码加密，请妥善保存密码。</p>
        <label class="backup-label">设置备份密码（至少 8 位）<input class="backup-export-password" type="password" autocomplete="new-password" placeholder="输入备份密码" maxlength="256"></label>
        <button class="backup-download" type="button">⇩ 下载备份 ZIP</button>
      </section>
      <section class="backup-section">
        <h3>2. 上传并恢复业务备份</h3>
        <p>可单击选择、拖拽、或通过 Ctrl+V 粘贴 ZIP 文件。上传校验不改变现有数据。</p>
        <div class="backup-drop" role="button" tabindex="0" aria-label="选择备份 ZIP 文件">
          <span class="backup-drop-symbol" aria-hidden="true">⇧</span>
          <strong>点击选择 / 拖拽 / Ctrl+V 粘贴</strong>
          <small>仅限本系统导出的加密 .zip 文件；最多 120 MB</small>
        </div>
        <input class="backup-file" type="file" accept=".zip,application/zip" hidden>
        <p class="backup-selected" aria-live="polite">尚未选择备份文件</p>
        <label class="backup-label">备份文件密码<input class="backup-restore-password" type="password" autocomplete="off" placeholder="输入导出备份时使用的密码" maxlength="256"></label>
        <fieldset class="backup-modes"><legend>恢复方式</legend>
          <label><input type="radio" name="business-backup-mode" value="replace" checked><span><strong>完整覆盖</strong><small>以备份替换当前业务数据；恢复前自动保存原数据库快照</small></span></label>
          <label><input type="radio" name="business-backup-mode" value="merge"><span><strong>合并导入</strong><small>保留现有记录与设置；冲突记录跳过并报告数量</small></span></label>
        </fieldset>
        <div class="backup-actions"><button class="backup-inspect" type="button">校验备份文件</button><button class="backup-restore" type="button" disabled>确认并恢复</button></div>
        <div class="backup-summary" hidden><strong>备份文件已验证</strong><div class="backup-summary-text"></div><small>本地图片文件不在备份内，也不会因恢复操作而删除。</small></div>
        <div class="backup-complete" hidden></div>
      </section>
      <p class="backup-feedback" role="status" aria-live="polite"></p>
    </div>`;
  document.body.appendChild(dialog);
  const $ = selector => dialog.querySelector(selector);
  const close = $('.backup-close'), fileInput = $('.backup-file'), drop = $('.backup-drop');
  const chosen = $('.backup-selected'), downloadBtn = $('.backup-download');
  const inspectBtn = $('.backup-inspect'), restoreBtn = $('.backup-restore');
  const summaryPanel = $('.backup-summary'), summaryText = $('.backup-summary-text');
  const completePanel = $('.backup-complete'), feedback = $('.backup-feedback');
  const exportPassword = $('.backup-export-password'), restorePassword = $('.backup-restore-password');
  let selectedFile=null, lastCheckedPassword='', busy=false;
  const write = (msg, error=false) => { feedback.textContent=msg; feedback.classList.toggle('backup-error',error); };
  const setBusy = value => {
    busy=value;
    for(const el of [downloadBtn,inspectBtn,restoreBtn,fileInput,exportPassword,restorePassword,...dialog.querySelectorAll('input[type=radio]')]){
      el.disabled=value || (el===restoreBtn && summaryPanel.hidden);
    }
  };
  function invalidate(){summaryPanel.hidden=true;restoreBtn.disabled=true;completePanel.hidden=true;lastCheckedPassword='';}
  function pick(file) {
    if(!file)return;
    if(!/\.zip$/i.test(file.name)){write('只能上传本系统导出的 .zip 备份文件',true);return;}
    if(file.size > 120*1024*1024){write('备份文件不能超过 120 MB',true);return;}
    selectedFile=file;chosen.textContent=`已选择：${file.name}（${(file.size/1024/1024).toFixed(2)} MB）`;
    invalidate();write('已选择文件。请输入备份密码并点击“校验备份文件”。');
  }
  open.addEventListener('click',()=>{if(busy)return; if(!dialog.open)dialog.showModal();});
  close.addEventListener('click',()=>{if(!busy)dialog.close();});
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  dialog.addEventListener('click',event=>{if(event.target===dialog&&!busy)dialog.close();});
  drop.addEventListener('click',()=>{if(!busy)fileInput.click();});
  drop.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();if(!busy)fileInput.click();}});
  fileInput.addEventListener('change',()=>{pick(fileInput.files?.[0]);fileInput.value='';});
  for(const type of ['dragenter','dragover'])drop.addEventListener(type,event=>{event.preventDefault();if(!busy)drop.classList.add('backup-dragging');});
  for(const type of ['dragleave','drop'])drop.addEventListener(type,event=>{event.preventDefault();drop.classList.remove('backup-dragging');});
  drop.addEventListener('drop',event=>{if(!busy)pick(event.dataTransfer?.files?.[0]);});
  document.addEventListener('paste',event=>{
    if(!dialog.open||busy)return;
    const tag=event.target?.tagName?.toLowerCase();
    if(tag==='input'||tag==='textarea'||event.target?.isContentEditable)return;
    const file=Array.from(event.clipboardData?.files||[]).find(f=>/\.zip$/i.test(f.name));
    if(file){event.preventDefault();event.stopImmediatePropagation();pick(file);}
  },true);
  restorePassword.addEventListener('input', invalidate);
  async function jsonResponse(response){
    const body=await response.json().catch(()=>null);
    if(response.status===401)throw Error('登录已失效，请刷新页面重新登录');
    if(!response.ok||body?.ok===false)throw Error(body?.message||`请求失败 (${response.status})`);
    return body;
  }
  const passwordOK = text => typeof text==='string'&&text.length>=8&&text.length<=256;
  const createPayload=() => {const form=new FormData();form.append('file',selectedFile);form.append('password',restorePassword.value);return form;};
  function addText(label,value,parent=summaryText){const p=document.createElement('div');p.textContent=`${label}：${value}`;parent.appendChild(p);}
  downloadBtn.addEventListener('click',async()=>{
    const password=exportPassword.value;
    if(!passwordOK(password))return write('请先输入至少 8 位的备份密码',true);
    setBusy(true);write('正在生成加密 ZIP，请稍候……');
    try{
      const response=await fetch('/api/backup/export',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({password})});
      if(!response.ok){await jsonResponse(response);throw Error('备份导出失败');}
      const bytes=await response.blob();
      const filename=response.headers.get('x-backup-filename')||`new-product-rating-backup-${new Date().toISOString().slice(0,10)}.zip`;
      const url=URL.createObjectURL(bytes),link=document.createElement('a');link.href=url;link.download=filename;
      document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60_000);
      write('备份已生成并开始下载。请妥善保存 ZIP 和备份密码。');
    }catch(e){write(e.message||'备份下载失败',true);}finally{setBusy(false);}
  });
  inspectBtn.addEventListener('click',async()=>{
    if(!selectedFile)return write('请先选择 ZIP 备份文件',true);
    if(!passwordOK(restorePassword.value))return write('请输入备份文件密码（至少 8 位）',true);
    setBusy(true);invalidate();write('正在检查备份文件……');
    try {
      const response=await fetch('/api/backup/inspect',{method:'POST',credentials:'include',body:createPayload()});
      const data=await jsonResponse(response);
      summaryText.replaceChildren();
      addText('备份时间',new Date(data.created_at).toLocaleString('zh-CN'));
      const c=data.counts||{};
      addText('款式',c.styles||0);addText('评分',c.scores||0);addText('评分链接',c.review_links||0);addText('设置条目',c.settings||0);
      addText('评分历史',c.history||0);addText('提交记录',c.submissions||0);addText('草稿',c.drafts||0);addText('评分进度',c.progress||0);
      summaryPanel.hidden=false;lastCheckedPassword=restorePassword.value;
      write('校验通过。请选择恢复方式后点击“确认并恢复”。');
    }catch(e){write(e.message||'备份校验失败',true);}finally{setBusy(false);}
  });
  restoreBtn.addEventListener('click',async()=>{
    if(!selectedFile||summaryPanel.hidden||lastCheckedPassword!==restorePassword.value)return write('请重新校验备份文件',true);
    const mode=$('input[name="business-backup-mode"]:checked')?.value||'replace';
    const msg=mode==='replace'?'确定“完整覆盖”吗？当前四个模块的数据将被备份数据替换；服务器会自动创建恢复前快照。图片文件保持不变。':'确定“合并导入”吗？现有记录和设置优先保留，重复/冲突数据将被跳过。';
    if(!window.confirm(msg))return;
    setBusy(true);write('正在恢复数据库，请不要关闭页面或重复操作……');
    try{
      const payload=createPayload();payload.append('mode',mode);
      const response=await fetch('/api/backup/restore',{method:'POST',credentials:'include',body:payload});
      const data=await jsonResponse(response);
      let added=0,skipped=0;
      for(const item of Object.values(data.results||{})){added+=Number(item.added||0);skipped+=Number(item.skipped||0);}
      completePanel.hidden=false;completePanel.replaceChildren();
      addText('恢复成功',mode==='replace'?'完整覆盖':'合并导入',completePanel);
      addText('恢复记录',added,completePanel);addText('跳过冲突',skipped,completePanel);
      if(data.backup_created)addText('恢复前快照',data.backup_created,completePanel);
      const refresh=document.createElement('button');refresh.type='button';refresh.textContent='刷新页面查看恢复数据';
      refresh.addEventListener('click',()=>window.location.reload());completePanel.appendChild(refresh);
      invalidate();completePanel.hidden=false;write('数据库恢复成功。图片文件未更改，请刷新页面查看。');
    }catch(e){write(e.message||'恢复失败，原数据未变更',true);}finally{setBusy(false);}
  });
})();
