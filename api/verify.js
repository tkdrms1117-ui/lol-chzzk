const { createClient } = require('@supabase/supabase-js');

// Test bypass nickname - this account skips all riot verification
//const TEST_BYPASS_NICKNAME = "해군상근";

// Test account default tier returned when bypass is triggered
const TEST_BYPASS_TIER = "UNRANKED";

module.exports = async function handler(req, res) {
  // Allow POST requests only
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { chzzkId, riotName, riotTag, expectedIcon } = req.body;

  // Check required fields
  if (!chzzkId || !riotName || !riotTag) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const RIOT_API_KEY = process.env.RIOT_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!RIOT_API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Environment variables missing' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Bypass verification entirely for the test account nickname
  if (riotName === TEST_BYPASS_NICKNAME) {
    const bypassTier = TEST_BYPASS_TIER;

    // Save test account to DB with bypass flag
    const { error: dbError } = await supabase
      .from('verified_users')
      .upsert({
        chzzk_id: chzzkId,
        riot_name: riotName,
        riot_tag: riotTag,
        tier: bypassTier,
        is_test_account: true,
        verified_at: new Date().toISOString()
      }, {
        onConflict: 'chzzk_id'
      });

    if (dbError) {
      return res.status(500).json({ error: 'DB save failed: ' + dbError.message });
    }

    return res.status(200).json({
      success: true,
      tier: bypassTier + ' (테스트 계정)',
      message: 'Test account bypass successful'
    });
  }

  try {
    // Step 1: Fetch PUUID from Riot account API using game name and tag
    const accountUrl =
      'https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/' +
      encodeURIComponent(riotName) + '/' +
      encodeURIComponent(riotTag);

    const accountRes = await fetch(accountUrl, {
      headers: { 'X-Riot-Token': RIOT_API_KEY }
    });

    if (accountRes.status === 404) {
      return res.status(400).json({ error: 'Riot account not found' });
    }

    if (accountRes.status === 403 || accountRes.status === 401) {
      return res.status(500).json({ error: 'Riot API Key expired or invalid' });
    }

    if (!accountRes.ok) {
      return res.status(500).json({ error: 'Riot API error: ' + accountRes.status });
    }

    const accountData = await accountRes.json();
    const puuid = accountData.puuid;

    // Step 2: Fetch summoner data using PUUID to get current profile icon
    const summonerUrl =
      'https://kr.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/' + puuid;

    const summonerRes = await fetch(summonerUrl, {
      headers: { 'X-Riot-Token': RIOT_API_KEY }
    });

    if (!summonerRes.ok) {
      return res.status(500).json({ error: 'Summoner lookup failed' });
    }

    const summonerData = await summonerRes.json();
    const currentIcon = summonerData.profileIconId;
    const summonerId = summonerData.id;

    // Step 3: Verify that the current icon matches the expected icon
    if (currentIcon !== expectedIcon) {
      return res.status(400).json({
        error: 'Icon does not match',
        currentIcon: currentIcon,
        expectedIcon: expectedIcon
      });
    }

    // Step 4: Fetch ranked tier information using summoner ID
    const rankedUrl =
      'https://kr.api.riotgames.com/lol/league/v4/entries/by-summoner/' + summonerId;

    const rankedRes = await fetch(rankedUrl, {
      headers: { 'X-Riot-Token': RIOT_API_KEY }
    });

    let tier = 'UNRANKED';

    if (rankedRes.ok) {
      const rankedData = await rankedRes.json();
      // Find solo ranked queue entry
      const soloQueue = rankedData.find(function(entry) {
        return entry.queueType === 'RANKED_SOLO_5x5';
      });
      if (soloQueue) {
        tier = soloQueue.tier + ' ' + soloQueue.rank;
      }
    }

    // Step 5: Save verified user data to Supabase
    const { error: dbError } = await supabase
      .from('verified_users')
      .upsert({
        chzzk_id: chzzkId,
        riot_name: riotName,
        riot_tag: riotTag,
        puuid: puuid,
        summoner_id: summonerId,
        tier: tier,
        is_test_account: false,
        verified_at: new Date().toISOString()
      }, {
        onConflict: 'chzzk_id'
      });

    if (dbError) {
      return res.status(500).json({ error: 'DB save failed: ' + dbError.message });
    }

    return res.status(200).json({ success: true, tier: tier });

  } catch (err) {
    return res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
};
