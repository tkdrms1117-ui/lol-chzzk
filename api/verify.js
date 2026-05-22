export default async function handler(req, res) {
    // Check if the request method is POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const riotName = req.body.riotName;
    const riotTag = req.body.riotTag;
    const expectedIcon = req.body.expectedIcon;
    const chzzkId = req.body.chzzkId;
    const apiKey = process.env.RIOT_API_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    // Check environment variables
    if (!apiKey || !supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Environment variables missing' });
    }

    try {
        // Fetch account data using Riot ID
        const accountUrl = "https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/" + encodeURIComponent(riotName) + "/" + encodeURIComponent(riotTag);
        const accountRes = await fetch(accountUrl, {
            headers: { "X-Riot-Token": apiKey }
        });

        if (!accountRes.ok) {
            return res.status(404).json({ error: 'Riot account not found' });
        }

        const accountData = await accountRes.json();
        const userPuuid = accountData.puuid;

        // Fetch summoner data using PUUID
        const summonerUrl = "https://kr.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/" + userPuuid;
        const summonerRes = await fetch(summonerUrl, {
            headers: { "X-Riot-Token": apiKey }
        });

        if (!summonerRes.ok) {
            return res.status(404).json({ error: 'Summoner not found' });
        }

        const summonerData = await summonerRes.json();
        const currentIcon = summonerData.profileIconId;

        // Verify profile icon
        if (currentIcon !== parseInt(expectedIcon)) {
            return res.status(400).json({ success: false, error: 'Icon does not match' });
        }

        // Fetch league data to get solo rank tier
        const leagueUrl = "https://kr.api.riotgames.com/lol/league/v4/entries/by-summoner/" + summonerData.id;
        const leagueRes = await fetch(leagueUrl, {
            headers: { "X-Riot-Token": apiKey }
        });
        const leagueData = await leagueRes.json();
        
        let userTier = "UNRANKED";
        for (let i = 0; i < leagueData.length; i++) {
            if (leagueData[i].queueType === "RANKED_SOLO_5x5") {
                userTier = leagueData[i].tier;
                break;
            }
        }

        // Save verified data to Supabase database
        const supabaseInsertUrl = supabaseUrl + "/rest/v1/verified_users";
        const insertPayload = {
            chzzk_id: chzzkId,
            riot_name: riotName,
            riot_tag: riotTag,
            tier: userTier
        };
        
        const supabaseRes = await fetch(supabaseInsertUrl, {
            method: "POST",
            headers: {
                "apikey": supabaseKey,
                "Authorization": "Bearer " + supabaseKey,
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates"
            },
            body: JSON.stringify(insertPayload)
        });

        if (!supabaseRes.ok) {
            return res.status(500).json({ error: 'Failed to save to database' });
        }

        return res.status(200).json({ success: true, tier: userTier });
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }
}