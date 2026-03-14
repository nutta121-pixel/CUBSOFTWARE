/**
 * Profanity Filter - Content moderation for user inputs
 * Prevents inappropriate words in vanity URLs and other user-generated content
 */

// Comprehensive list of prohibited words/phrases
const PROHIBITED_WORDS = [
    // Common profanity (with variations)
    'fuck', 'fck', 'fuk', 'fuq', 'phuck', 'fvck', 'fucked', 'fucker', 'fucking', 'fucks', 'fuckin',
    'shit', 'shyt', 'sht', 'shite', 'shitting', 'shitted', 'shitty', 'bullshit', 'horseshit',
    'damn', 'dammit', 'damnit', 'damned',
    'bitch', 'biotch', 'biatch', 'bitches', 'bitching', 'bitchy',
    'ass', 'arse', 'asshole', 'arsehole', 'arshole', 'asswipe', 'jackass', 'dumbass', 'badass',
    'bastard', 'basterd', 'bstard',
    'crap', 'crappy', 'crapping',
    'piss', 'pissed', 'pissing', 'pisser',
    'cock', 'cok', 'cawk', 'cocksucker', 'cocks',
    'dick', 'dik', 'dck', 'dickhead', 'dicks',
    'pussy', 'pussies', 'pussi', 'pusi', 'puss',
    'cunt', 'cnt', 'kunt', 'kunts', 'cunts',
    'twat', 'tw4t', 'twats',
    'fag', 'faggot', 'fagot', 'fags', 'faggots',
    'whore', 'hore', 'wh0re', 'whores', 'whoring',
    'slut', 'slut', 'sluts', 'slutty',
    'hell', 'heck',

    // Slurs and offensive terms (racial, ethnic, orientation)
    'nigger', 'nigga', 'nigg', 'n1gger', 'n1gga', 'nig', 'nigar', 'niggar', 'nggr',
    'retard', 'retarded', 'ret4rd', 'rtard', 'tard', 'retards',
    'tranny', 'tr4nny', 'trannies', 'trannie',
    'chink', 'ch1nk', 'chinks',
    'spic', 'sp1c', 'spick', 'spics',
    'kike', 'k1ke', 'kikes',
    'beaner', 'b3aner', 'beaners',
    'wetback', 'w3tback', 'wetbacks',
    'gook', 'g00k', 'gooks',
    'jap', 'j4p', 'japs',
    'cracker', 'crackers', 'cr4cker',
    'honky', 'honkey', 'h0nky',
    'whitey', 'wh1tey',
    'darky', 'darkie', 'd4rky',
    'dyke', 'dyk3', 'dykes',
    'homo', 'h0mo', 'homos', 'homosexual',
    'queer', 'qu33r', 'queers',
    'lesbo', 'l3sbo', 'lesbos',
    'paki', 'p4ki', 'pakis',
    'towelhead', 't0welhead',
    'sandnigger', 's4ndnigger',
    'raghead', 'r4ghead',

    // Sexual/inappropriate terms (explicit)
    'porn', 'p0rn', 'porno', 'pornography', 'pr0n',
    'sex', 's3x', 'sexy', 'sexual', 'sexting',
    'anal', '4nal', 'anus',
    'rape', 'r4pe', 'raping', 'rapist', 'raped',
    'molest', 'm0lest', 'molested', 'molester', 'molesting',
    'pedo', 'p3do', 'pedophile', 'paedo', 'paedophile', 'pedos',
    'nude', 'nud3', 'nudes', 'naked', 'nak3d',
    'tits', 't1ts', 'titties', 'titty', 'boobies',
    'boobs', 'b00bs', 'boobies', 'breast', 'breasts',
    'penis', 'p3nis', 'penises', 'penus',
    'vagina', 'v4gina', 'vag', 'vaginas',
    'orgasm', '0rgasm', 'orgasms',
    'masturbate', 'm4sturbate', 'masturbating', 'masturbation', 'wank', 'jerk off', 'jerkoff',
    'cumshot', 'cum', 'c um', 'cumming', 'jizz', 'j1zz',
    'blowjob', 'bl0wjob', 'bj', 'fellatio', 'oral',
    'handjob', 'h4ndjob',
    'erection', 'er3ction', 'boner', 'b0ner', 'hardon',
    'dildo', 'd1ldo', 'dildos', 'vibrator',
    'hentai', 'h3ntai', 'ecchi', '3cchi',
    'milf', 'm1lf', 'gilf', 'g1lf',
    'nsfw', 'n5fw',
    'xxx', 'xxxx',
    'horny', 'h0rny',
    'kinky', 'k1nky',
    'fetish', 'f3tish',
    'incest', '1ncest', 'inbred',

    // Hateful/violent terms
    'nazi', 'n4zi', 'nazis', 'nazism',
    'hitler', 'h1tler', 'adolf',
    'kill', 'k1ll', 'killing', 'killer', 'kills', 'killed',
    'murder', 'murd3r', 'murdering', 'murderer', 'murders',
    'suicide', 'su1cide', 'suicidal', 'kms', 'kys', 'kill yourself',
    'terrorist', 't3rrorist', 'terrorism', 'terrorists',
    'bomb', 'b0mb', 'bombing', 'bomber', 'bombs', 'explosive',
    'genocide', 'g3nocide',
    'kkk', 'ku klux', 'klan',
    'lynch', 'lynching', 'lynched',
    'supremacist', 'supremacy',
    'swastika', 'sw4stika',
    'jihad', 'j1had', 'jihadist',
    'isis', '1sis', 'isil',
    'execute', 'execution', 'executioner',
    'torture', 't0rture', 'torturing',
    'massacre', 'm4ssacre', 'slaughter',
    'shoot', 'shooting', 'shooter', 'shootup',
    'gun', 'guns', 'firearm', 'weapon',
    'assault', '4ssault', 'attack',
    'stab', 'stabbing', 'stabbed',
    'strangle', 'strangling',

    // Drug references
    'cocaine', 'c0caine', 'coke', 'blow', 'snow',
    'heroin', 'h3roin', 'smack', 'junk',
    'meth', 'm3th', 'crystal', 'methamphetamine',
    'crack', 'cr4ck', 'freebase',
    'weed', 'w33d', 'marijuana', 'pot', 'ganja', 'cannabis',
    'lsd', 'acid', '4cid',
    'ecstasy', '3cstasy', 'molly', 'mdma',
    'shrooms', 'mushrooms', 'psilocybin',
    'xanax', 'x4nax', 'benzos',
    'adderall', '4dderall',
    'oxy', 'oxycontin', 'percocet',
    'fentanyl', 'f3ntanyl',
    'drug dealer', 'drugdealer',

    // Scam/Impersonation terms
    'admin', '4dmin', 'administrator',
    'moderator', 'm0derator', 'mod', 'm0d',
    'official', '0fficial', 'staff', 'st4ff',
    'support', 'supp0rt', 'help desk', 'helpdesk',
    'discord', 'd1scord', 'discordapp',
    'questcord', 'qu3stcord',
    'owner', '0wner',
    'developer', 'd3veloper', 'dev', 'd3v',
    'nitro', 'n1tro', 'free nitro', 'freenitro',
    'giveaway', 'g1veaway', 'gift', 'free gift',
    'hack', 'h4ck', 'hacker', 'hacking',
    'scam', 'sc4m', 'scammer', 'scamming',
    'phish', 'phishing', 'ph1sh',

    // Body parts (crude)
    'butthole', 'butt', 'buttcheeks',
    'ballsack', 'balls', 'b4lls', 'testicles', 'nutsack', 'nuts',
    'rectum', 'r3ctum',
    'nipple', 'n1pple', 'nipples',
    'clit', 'clitoris',
    'labia', 'l4bia',
    'scrotum', 'scr0tum',

    // Additional crude/vulgar terms
    'semen', 's3men', 'sperm', 'sp3rm',
    'feces', 'f3ces', 'poop', 'p00p', 'turd', 'dump',
    'urine', 'ur1ne', 'pee', 'p33',
    'vomit', 'v0mit', 'puke', 'barf',
    'bloody', 'bl00dy',
    'smut', 'sm ut',
    'lewd', 'l3wd',
    'pervert', 'p3rvert', 'perv', 'p3rv', 'perverted',
    'degenerate', 'd3generate',
    'depraved', 'd3praved',
    'obscene', '0bscene',

    // Hate symbols and extremist terms
    'whitepower', 'white power',
    'aryan', '4ryan',
    'skinhead', 'sk1nhead',
    'confederate', 'c0nfederate',
    '1488', '14 88', 'eighty eight',
    'gas the', 'gasthe',
    'race war', 'racewar',
    'ethnic cleansing',

    // Common obfuscation patterns
    'fuk u', 'fukyou', 'fk you',
    'stfu', 'stf u', 'shut the fuck',
    'gtfo', 'gtf o', 'get the fuck',
    'wtf', 'wt f', 'what the fuck',
    'omfg', 'omf g',
    'milf', 'mother i\'d like',
    'soab', 'son of a bitch', 'sonofabitch',
    'pos', 'piece of shit',
    'a55', 'a55hole',
    'b1tch', 'b!tch',
    'fuk', 'fuq', 'phuk',
    'sht', 'sh1t', 'sh!t',
    'd1ck', 'd!ck',
    'pu55y', 'pu$$y',
    'cnt', 'c unt',
    'fgt', 'f4ggot',
    'wh0r3', 'wh0re',
    'sl ut', 'sl0t',

    // Additional inappropriate
    'jihadi', 'radical islam',
    'white genocide',
    'incel', '1ncel',
    'simp', 's1mp',
    'cuck', 'c uck', 'cuckold',
    'thot', 'th0t',
    'trap', 'tr4p',
    'loli', 'l0li', 'lolita', 'lolicon',
    'shota', 'sh0ta', 'shotacon',
    'tentacle', 't3ntacle',
    'ahegao', '4hegao',
    'yaoi', 'y40i',
    'yuri', 'yur1',
    'futa', 'futanari',
    'scat', 'sc4t',
    'gore', 'g0re', 'guro',
    'snuff', 'snuf f',
    'necro', 'n3cro', 'necrophilia',
    'bestiality', 'b3stiality', 'zoophilia',

    // Gaming slurs
    'noob', 'n00b', 'scrub', 'trash player',
    'inting', '1nting',
    'hardstuck', 'hardst uck',
    'boosted', 'b00sted',

    // Additional variations
    'motherfucker', 'motherf ucker', 'mofo', 'm0f0',
    'goddamn', 'god damn', 'g0ddamn',
    'jesus christ', 'jesus h christ',
    'holy shit', 'holyshit',
    'son of a bitch',
    'piece of shit',
    'full of shit',
    'eat shit',
    'no shit',
    'dipshit', 'd1pshit',
    'chickenshit', 'ch1ckenshit',
    'apeshit', '4peshit'
];

// Leetspeak and common substitutions
const SUBSTITUTIONS = {
    '0': 'o',
    '1': 'i',
    '3': 'e',
    '4': 'a',
    '5': 's',
    '7': 't',
    '8': 'b',
    '@': 'a',
    '$': 's',
    '!': 'i',
    '+': 't'
};

/**
 * Normalize text by replacing leetspeak and removing special characters
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
function normalizeText(text) {
    if (!text) return '';

    let normalized = text.toLowerCase();

    // Replace leetspeak substitutions
    for (const [char, replacement] of Object.entries(SUBSTITUTIONS)) {
        normalized = normalized.split(char).join(replacement);
    }

    // Remove common separators but keep the text
    normalized = normalized.replace(/[-_\.]/g, '');

    return normalized;
}

/**
 * Check if text contains prohibited words
 * @param {string} text - Text to check
 * @returns {Object} Result with isProfane flag and matched words
 */
function checkProfanity(text) {
    if (!text) {
        return { isProfane: false, matches: [] };
    }

    const normalized = normalizeText(text);
    const matches = [];

    // Check for exact matches and partial matches
    for (const word of PROHIBITED_WORDS) {
        if (normalized.includes(word)) {
            matches.push(word);
        }
    }

    return {
        isProfane: matches.length > 0,
        matches: matches
    };
}

/**
 * Validate vanity URL for inappropriate content
 * @param {string} vanityUrl - Vanity URL to validate
 * @returns {Object} Validation result
 */
function validateVanityUrl(vanityUrl) {
    if (!vanityUrl) {
        return { isValid: true };
    }

    const result = checkProfanity(vanityUrl);

    if (result.isProfane) {
        return {
            isValid: false,
            error: 'Vanity URL contains inappropriate content',
            matches: result.matches
        };
    }

    return { isValid: true };
}

/**
 * Validate bio for inappropriate content
 * @param {string} bio - Bio text to validate
 * @returns {Object} Validation result
 */
function validateBio(bio) {
    if (!bio) {
        return { isValid: true };
    }

    const result = checkProfanity(bio);

    if (result.isProfane) {
        return {
            isValid: false,
            error: 'Bio contains inappropriate content',
            matches: result.matches
        };
    }

    return { isValid: true };
}

module.exports = {
    checkProfanity,
    validateVanityUrl,
    validateBio,
    normalizeText
};
