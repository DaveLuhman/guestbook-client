// Track if entry feedback is currently showing to prevent premature resets
let isEntryFeedbackShowing = false;

export function getIsEntryFeedbackShowing(): boolean {
  return isEntryFeedbackShowing;
}

function resetEntryDisplay(): void {
  const entryData = document.getElementById('entry-data');
  if (entryData) {
    const isNetworkUnavailable = document.body.classList.contains(
      'network-unavailable-state'
    );

    if (!isNetworkUnavailable) {
      entryData.innerHTML =
        '<p>Swipe your card or scan your barcode to record an entry...</p>';
    } else {
      entryData.innerHTML =
        '<p>The network is unavailable and entries cannot be recorded at this time.</p>';
    }
  }
  document.body.classList.remove('success-state', 'error-state');
  isEntryFeedbackShowing = false;
}

export function showEntrySuccess(): void {
  const entryData = document.getElementById('entry-data');
  if (entryData) {
    entryData.innerHTML = '<p>Entry submitted successfully!</p>';
    document.body.classList.add('success-state');
    isEntryFeedbackShowing = true;
    setTimeout(() => {
      resetEntryDisplay();
    }, 3000);
  }
}

export function showEntryError(): void {
  const entryData = document.getElementById('entry-data');
  if (entryData) {
    entryData.innerHTML = '<p>Error submitting entry. Please try again.</p>';
    document.body.classList.add('error-state');
    isEntryFeedbackShowing = true;
    setTimeout(() => {
      resetEntryDisplay();
    }, 3000);
  }
}
