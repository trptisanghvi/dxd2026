(function () {
  const DAN_FLAVIN_REF = {
    station: 'Grand Central-42 St',
    artist: 'Dan Flavin',
    // title: ,
    url: 'https://www.instagram.com/p/C7mjDhXM1fZ/?hl=en',
    isReference: true
  };
  const SOL_LEWITT_STATION = '59 St-Columbus Circle';
  const SOL_LEWITT_ARTIST = 'Sol LeWitt';

  function isReference(entry, line) {
    if (entry.isReference) return true;
    if (line === '123' && entry.station === SOL_LEWITT_STATION && entry.artist === SOL_LEWITT_ARTIST) return true;
    return false;
  }

  function renderList(line, data) {
    let items = data[line] || [];
    if (line === '456') {
      items = [DAN_FLAVIN_REF].concat(items);
    }
    const container = document.getElementById('catalog-list');
    if (!container) return;
    container.innerHTML = items
      .map(function (entry) {
        const ref = isReference(entry, line);
        const refClass = ref ? ' art-item-reference' : '';
        const refLabel = ref ? ' <span class="reference-badge">Referenced in piece</span>' : '';
        const href = entry.url ? (' href="' + entry.url + '" target="_blank" rel="noopener noreferrer"') : '';
        const tag = entry.url ? 'a' : 'span';
        const station = escapeHtml(entry.station);
        const artist = escapeHtml(entry.artist);
        const title = escapeHtml(entry.title);
        return (
          '<' + tag + ' class="art-item' + refClass + '"' + (tag === 'a' ? href : '') + '>' +
            '<span class="art-station">' + station + '</span> ' +
            '<span class="art-artist">' + artist + '</span>, ' +
            '<span class="art-title">' + title + '</span>' + refLabel +
          '</' + tag + '>'
        );
      })
      .join('');
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function init() {
    const container = document.getElementById('catalog-list');
    const tabs = document.querySelectorAll('.catalog-tab');
    if (!container || !tabs.length) return;

    fetch('mta-art-lines.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        renderList('123', data);
        tabs.forEach(function (btn) {
          btn.addEventListener('click', function () {
            const line = this.getAttribute('data-line');
            tabs.forEach(function (t) {
              t.classList.remove('active');
              t.setAttribute('aria-selected', 'false');
            });
            this.classList.add('active');
            this.setAttribute('aria-selected', 'true');
            renderList(line, data);
          });
        });
      })
      .catch(function () {
        container.innerHTML = '<p class="catalog-error">Art catalog could not be loaded.</p>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
