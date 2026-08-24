/**
 * 原型演示脚本：角色切换、弹窗、Toast、入库进度、流式问答、引用联动
 * 不接真实后端，只服务可点击演示主路径。
 */
(function () {
  const ROLE_KEY = 'monai-rag-role';
  const KB_KEY = 'monai-rag-kb';

  function getRole() {
    return localStorage.getItem(ROLE_KEY) || 'admin';
  }

  function setRole(role) {
    localStorage.setItem(ROLE_KEY, role);
    applyRole();
  }

  function getKb() {
    return localStorage.getItem(KB_KEY) || '产品手册库';
  }

  function setKb(name) {
    localStorage.setItem(KB_KEY, name);
    document.querySelectorAll('[data-kb-label]').forEach(function (el) {
      el.textContent = name;
    });
  }

  function applyRole() {
    var role = getRole();
    var isAdmin = role === 'admin';
    document.documentElement.dataset.role = role;
    document.querySelectorAll('[data-admin-only]').forEach(function (el) {
      el.classList.toggle('hidden', !isAdmin);
    });
    document.querySelectorAll('[data-user-only]').forEach(function (el) {
      el.classList.toggle('hidden', isAdmin);
    });
    document.querySelectorAll('[data-role-label]').forEach(function (el) {
      el.textContent = isAdmin ? '管理员' : '终端用户';
    });
    document.querySelectorAll('[data-role-select]').forEach(function (el) {
      el.value = role;
    });
  }

  window.openModal = function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  };

  window.closeModal = function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  };

  window.toast = function (text) {
    var t = document.createElement('div');
    t.className =
      'toast-enter fixed top-5 left-1/2 -translate-x-1/2 z-[70] bg-ink text-white text-sm px-4 py-2.5 rounded-ctrl shadow-soft';
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(function () {
      t.remove();
    }, 2000);
  };

  window.confirmDanger = function (msg, onOk) {
    if (window.confirm(msg)) {
      if (onOk) onOk();
    }
  };

  window.showComingSoon = function (name) {
    openModal('modal-coming-soon');
    var title = document.getElementById('coming-soon-title');
    if (title) title.textContent = name || '该能力';
  };

  /** 入库进度抽屉演示：映射增量索引的新增/跳过/失败计数心智 */
  window.demoIngestProgress = function () {
    openModal('drawer-ingest');
    var bar = document.getElementById('ingest-bar');
    var label = document.getElementById('ingest-label');
    var live = document.getElementById('ingest-live');
    var log = document.getElementById('ingest-log');
    if (!bar || !label) return;

    var total = 48;
    var current = 0;
    var stats = { add: 0, skip: 0, fail: 0 };
    var files = ['退货政策.md', 'FAQ.md', '运费说明.md', '发票开具指引.md', '会员积分规则.md'];

    if (window.__ingestTimer) clearInterval(window.__ingestTimer);
    window.__ingestTimer = setInterval(function () {
      current += 1;
      if (current % 5 === 0) stats.fail += 1;
      else if (current % 3 === 0) stats.add += 1;
      else stats.skip += 1;

      var pct = Math.min(100, Math.round((current / total) * 100));
      bar.style.width = pct + '%';
      label.textContent = '正在处理 ' + current + ' / ' + total;
      var name = files[current % files.length];
      if (live) live.textContent = '当前：' + name;
      if (log) {
        log.innerHTML =
          '<span class="count-chip count-chip--add">新增 ' +
          stats.add +
          '</span> ' +
          '<span class="count-chip count-chip--skip">跳过 ' +
          stats.skip +
          '</span> ' +
          '<span class="count-chip count-chip--fail">失败 ' +
          stats.fail +
          '</span>' +
          (current % 5 === 0
            ? '<p class="text-xs text-danger mt-2">· FAQ.md 失败：内容为空，已跳过并继续</p>'
            : '');
      }
      if (current >= total) {
        clearInterval(window.__ingestTimer);
        toast('入库完成：新增 ' + stats.add + ' / 跳过 ' + stats.skip + ' / 失败 ' + stats.fail);
      }
    }, 180);
  };

  /** 流式问答演示 */
  window.demoStreamAnswer = function () {
    var box = document.getElementById('assistant-stream');
    var sendBtn = document.getElementById('btn-send');
    var input = document.getElementById('ask-input');
    if (!box || !input) return;

    var q = (input.value || '').trim() || '退货时效是多久？';
    var userBubble = document.getElementById('demo-user-msg');
    if (userBubble) userBubble.textContent = q;

    var full =
      '一般情况下，自签收之日起 7 日内可申请退货<span class="cite-badge" data-cite="1">1</span>。若商品属于特殊品类（如定制件、鲜活易腐），则不适用该时效<span class="cite-badge" data-cite="2">2</span>。建议在申请时准备订单号与签收凭证，以便客服核对。';
    box.innerHTML = '';
    box.classList.add('stream-cursor');
    if (sendBtn) {
      sendBtn.textContent = '停止';
      sendBtn.dataset.streaming = '1';
    }

    var i = 0;
    if (window.__streamTimer) clearInterval(window.__streamTimer);
    window.__streamTimer = setInterval(function () {
      i += 3;
      box.innerHTML = full.slice(0, i);
      if (i >= full.length) {
        clearInterval(window.__streamTimer);
        box.classList.remove('stream-cursor');
        box.innerHTML = full;
        bindCiteBadges();
        if (sendBtn) {
          sendBtn.textContent = '发送';
          delete sendBtn.dataset.streaming;
        }
        var citePanel = document.getElementById('cite-panel');
        if (citePanel) citePanel.classList.remove('hidden');
        var emptyCite = document.getElementById('cite-empty');
        if (emptyCite) emptyCite.classList.add('hidden');
      }
    }, 40);
  };

  window.stopStream = function () {
    if (window.__streamTimer) clearInterval(window.__streamTimer);
    var box = document.getElementById('assistant-stream');
    if (box) {
      box.classList.remove('stream-cursor');
      if (!box.textContent.includes('已中断')) {
        box.innerHTML += ' <span class="text-xs text-warning font-medium">（已中断）</span>';
      }
    }
    var sendBtn = document.getElementById('btn-send');
    if (sendBtn) {
      sendBtn.textContent = '发送';
      delete sendBtn.dataset.streaming;
    }
  };

  function bindCiteBadges() {
    document.querySelectorAll('.cite-badge').forEach(function (badge) {
      badge.addEventListener('click', function () {
        var id = badge.getAttribute('data-cite');
        document.querySelectorAll('.cite-badge').forEach(function (b) {
          b.classList.toggle('is-active', b.getAttribute('data-cite') === id);
        });
        document.querySelectorAll('.cite-card').forEach(function (card) {
          card.classList.toggle('is-active', card.getAttribute('data-cite') === id);
        });
      });
    });
    document.querySelectorAll('.cite-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var id = card.getAttribute('data-cite');
        document.querySelectorAll('.cite-badge').forEach(function (b) {
          b.classList.toggle('is-active', b.getAttribute('data-cite') === id);
        });
        document.querySelectorAll('.cite-card').forEach(function (c) {
          c.classList.toggle('is-active', c.getAttribute('data-cite') === id);
        });
      });
    });
  }

  window.bindCiteBadges = bindCiteBadges;

  /** 文档表防抖过滤 */
  window.bindDocFilter = function () {
    var input = document.getElementById('doc-search');
    var status = document.getElementById('doc-status-filter');
    if (!input) return;
    var timer;
    function apply() {
      var q = (input.value || '').toLowerCase();
      var st = status ? status.value : 'all';
      document.querySelectorAll('#doc-table tbody tr[data-row]').forEach(function (tr) {
        var text = tr.textContent.toLowerCase();
        var rowSt = tr.getAttribute('data-status') || '';
        var okQ = !q || text.indexOf(q) !== -1;
        var okS = st === 'all' || rowSt === st;
        tr.classList.toggle('hidden', !(okQ && okS));
      });
    }
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(apply, 220);
    });
    if (status) status.addEventListener('change', apply);
  };

  document.addEventListener('DOMContentLoaded', function () {
    applyRole();
    setKb(getKb());

    document.querySelectorAll('[data-role-select]').forEach(function (el) {
      el.addEventListener('change', function () {
        setRole(el.value);
        toast(el.value === 'admin' ? '已切换为管理员视图' : '已切换为终端用户视图');
      });
    });

    document.querySelectorAll('[data-kb-switch]').forEach(function (el) {
      el.addEventListener('change', function () {
        var next = el.value;
        var draft = document.getElementById('ask-input');
        if (draft && draft.value.trim()) {
          var keep = window.confirm(
            '切换知识库后，输入框草稿将标注所属库变更。是否保留草稿？\n（取消则清空）',
          );
          if (!keep) draft.value = '';
        }
        setKb(next);
        toast('已切换到「' + next + '」');
      });
      el.value = getKb();
    });

    bindCiteBadges();
    bindDocFilter();

    var sendBtn = document.getElementById('btn-send');
    if (sendBtn) {
      sendBtn.addEventListener('click', function () {
        if (sendBtn.dataset.streaming) stopStream();
        else demoStreamAnswer();
      });
    }
  });
})();
