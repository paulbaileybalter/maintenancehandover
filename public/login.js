(function () {
  var b = '';
  for (var i = 0; i < 16; i++) { var s = 8 + Math.random() * 26; b += '<span style="left:' + Math.random() * 100 + '%;width:' + s + 'px;height:' + s + 'px;animation-duration:' + (9 + Math.random() * 11) + 's;animation-delay:-' + Math.random() * 14 + 's"></span>'; }
  document.getElementById('bubbles').innerHTML = b;
  var form = document.getElementById('loginForm'), err = document.getElementById('err'), go = document.getElementById('go');
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    err.textContent = ''; go.disabled = true; go.textContent = 'Signing in…';
    try {
      var res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ password: document.getElementById('password').value }) });
      if (res.ok) { location.replace('/' + location.hash); return; }
      var j = await res.json().catch(function () { return {}; });
      err.textContent = j.error || 'Sign in failed.';
    } catch (x) { err.textContent = 'Couldn’t reach the server. Check your connection.'; }
    go.disabled = false; go.textContent = 'Sign in';
  });
})();
