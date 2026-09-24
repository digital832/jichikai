(function () {
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await originalFetch(...args);
    if (res.status === 401) {
      location.href = '/admin/login.html?next=' + encodeURIComponent(location.pathname);
    }
    return res;
  };
})();
