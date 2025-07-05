const entryDataEl = document.getElementById('entry-data');


export const updateScanData = (payload: string) => {
    if (entryDataEl) {
      const body = document.body;
      body.style.backgroundColor = "green";
      entryDataEl.innerHTML = `<div class="entry-data-container"><p>Onecard: ${payload}</p></div>`;
    }
  };
