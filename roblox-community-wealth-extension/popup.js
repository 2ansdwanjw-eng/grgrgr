/* eslint-env browser, webextensions */
const communityLinkInput = document.getElementById('communityLink');
const searchBtn = document.getElementById('searchBtn');
const refreshBtn = document.getElementById('refreshBtn');
const resultsDiv = document.getElementById('results');
const statusDiv = document.getElementById('status');

// Store last fetched community ID and data in chrome.storage
async function setStorage(data) {
  return chrome.storage.local.set(data);
}

async function getStorage(keys) {
  return chrome.storage.local.get(keys);
}

function extractCommunityId(link) {
  // Matches /communities/<digits>/  capturing the digits
  const match = link.match(/\/communities\/(\d+)/);
  if (match) {
    return match[1];
  }
  return null;
}

async function validateCommunityId(id) {
  try {
    const res = await fetch(`https://groups.roblox.com/v1/groups/${id}`);
    return res.ok;
  } catch (err) {
    console.error('Validation error', err);
    return false;
  }
}

async function fetchAllMembers(id) {
  const members = [];
  let cursor = '';
  let attempts = 0;
  while (cursor !== null && attempts < 100) { // safety limit
    const url = `https://groups.roblox.com/v1/groups/${id}/users?limit=100&sortOrder=Asc${cursor ? `&cursor=${cursor}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch members');
    const data = await res.json();
    if (Array.isArray(data.data)) {
      members.push(...data.data.map(d => d.user));
    }
    cursor = data.nextPageCursor;
    attempts += 1;
  }
  return members;
}

async function fetchUserWealth(userId) {
  let total = 0;
  let cursor = '';
  let attempts = 0;
  while (cursor !== null && attempts < 50) {
    const url = `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100&sortOrder=Desc${cursor ? `&cursor=${cursor}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) break; // skip on error
    const data = await res.json();
    if (Array.isArray(data.data)) {
      for (const item of data.data) {
        const rap = item.recentAveragePrice || 0;
        if (rap >= 10000) {
          total += rap;
        }
      }
    }
    cursor = data.nextPageCursor;
    attempts += 1;
  }
  return total;
}

async function rankMembersByWealth(members) {
  const ranked = [];
  let processed = 0;
  for (const member of members) {
    statusDiv.textContent = `Processing ${++processed}/${members.length} users...`;
    const wealth = await fetchUserWealth(member.userId);
    ranked.push({ username: member.username, userId: member.userId, wealth });
  }
  ranked.sort((a, b) => b.wealth - a.wealth);
  return ranked;
}

function displayResults(list) {
  resultsDiv.innerHTML = '';
  list.forEach((entry, index) => {
    const row = document.createElement('div');
    row.className = 'member';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = `${index + 1}. ${entry.username}`;
    const wealthSpan = document.createElement('span');
    wealthSpan.textContent = entry.wealth.toLocaleString();

    row.appendChild(nameSpan);
    row.appendChild(wealthSpan);
    resultsDiv.appendChild(row);
  });
}

async function startSearch() {
  const link = communityLinkInput.value.trim();
  const id = extractCommunityId(link);
  if (!id) {
    statusDiv.textContent = 'Invalid community link.';
    return;
  }
  statusDiv.textContent = 'Validating community...';
  const valid = await validateCommunityId(id);
  if (!valid) {
    statusDiv.textContent = 'Invalid community ID';
    return;
  }
  statusDiv.textContent = 'Fetching members...';
  try {
    const members = await fetchAllMembers(id);
    statusDiv.textContent = `Fetched ${members.length} members. Calculating wealth...`;
    const ranked = await rankMembersByWealth(members);
    displayResults(ranked);
    statusDiv.textContent = `Completed. Displaying top ${ranked.length} members.`;
    await setStorage({ lastCommunityId: id, lastResults: ranked });
    refreshBtn.disabled = false;
  } catch (err) {
    console.error(err);
    statusDiv.textContent = 'Error occurred while fetching data.';
  }
}

async function refresh() {
  const { lastCommunityId } = await getStorage(['lastCommunityId']);
  if (!lastCommunityId) return;
  communityLinkInput.value = `https://www.roblox.com/communities/${lastCommunityId}`;
  await startSearch();
}

searchBtn.addEventListener('click', startSearch);
refreshBtn.addEventListener('click', refresh);

// On load, restore last community ID
(async () => {
  const { lastCommunityId } = await getStorage(['lastCommunityId']);
  if (lastCommunityId) {
    communityLinkInput.value = `https://www.roblox.com/communities/${lastCommunityId}`;
    refreshBtn.disabled = false;
  }
})();