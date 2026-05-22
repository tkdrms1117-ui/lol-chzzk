export default async function handler(req, res) {
    // Check if the request method is POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const riotName = req.body.riotName;
    const riotTag = req.body.riotTag;
    const expectedIcon = req.body.expectedIcon;
    const apiKey = process.env.RIOT_API_KEY;

    // Check if API key exists in environment variables
    if (!apiKey) {
        return res.status(500).json({ error: 'API key is missing' });
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

        // Verify if the current profile icon matches the expected random icon
        if (currentIcon === parseInt(expectedIcon)) {
            return res.status(200).json({ success: true, summonerId: summonerData.id });
        } else {
            return res.status(400).json({ success: false, error: 'Icon does not match' });
        }
    } catch (error) {
        // Handle unexpected server errors
        return res.status(500).json({ error: 'Internal server error' });
    }
}