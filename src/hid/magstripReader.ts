const entryDataEl = document.getElementById('entry-data');

export const updateSwipeData = (payload: any) => {
  if (entryDataEl) {
    const body = document.body;
    body.style.backgroundColor = "green";
    entryDataEl.innerHTML = `<div class="entry-data-container"><p>Name: ${payload.name}</p><p>Onecard: ${payload.onecard}</p></div>`;
  }
};