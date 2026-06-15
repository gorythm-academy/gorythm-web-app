/**
 * Parse Vimeo / YouTube page URLs and build embed URLs for the site player.
 */

function normalizeVideoInput(raw) {
    let url = String(raw || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) {
        url = `https://${url}`;
    }
    return url;
}

function isVimeoHost(host) {
    const h = host.replace(/^www\./, '');
    return h === 'vimeo.com' || h === 'player.vimeo.com';
}

function isYouTubeHost(host) {
    const h = host.replace(/^www\./, '');
    return (
        h === 'youtube.com' ||
        h === 'm.youtube.com' ||
        h === 'music.youtube.com' ||
        h === 'youtu.be' ||
        h === 'youtube-nocookie.com'
    );
}

function parseVimeo(url) {
    try {
        const u = new URL(url);
        const host = u.hostname.replace(/^www\./, '');
        let id = '';
        const hash = u.searchParams.get('h') || '';

        if (host === 'vimeo.com') {
            const parts = u.pathname.split('/').filter(Boolean);
            if (parts[0] === 'video' && parts[1]) id = parts[1];
            else if (parts[0] && /^\d+$/.test(parts[0])) id = parts[0];
        } else if (host === 'player.vimeo.com') {
            const m = u.pathname.match(/\/video\/(\d+)/);
            if (m) id = m[1];
        }

        if (!id) return null;

        const params = new URLSearchParams({
            autoplay: '1',
            playsinline: '1',
            title: '0',
            byline: '0',
            portrait: '0',
            api: '1',
        });
        if (hash) params.set('h', hash);

        return {
            provider: 'vimeo',
            videoId: id,
            embedSrc: `https://player.vimeo.com/video/${id}?${params.toString()}`,
        };
    } catch {
        return null;
    }
}

function extractYouTubeId(u) {
    const host = u.hostname.replace(/^www\./, '');
    let id = '';

    if (host === 'youtu.be') {
        id = u.pathname.split('/').filter(Boolean)[0] || '';
    } else {
        const parts = u.pathname.split('/').filter(Boolean);
        const section = parts[0] || '';

        if (section === 'watch') {
            id = u.searchParams.get('v') || u.searchParams.get('vi') || '';
        } else if (section === 'embed' || section === 'shorts' || section === 'live' || section === 'v') {
            id = parts[1] || '';
        }
    }

    if (id) {
        id = id.split(/[?&#]/)[0].trim();
    }

    if (!id || !/^[\w-]{6,}$/i.test(id)) return '';
    return id;
}

function parseYouTube(url) {
    try {
        const u = new URL(url);
        const id = extractYouTubeId(u);
        if (!id) return null;

        const params = new URLSearchParams({
            autoplay: '1',
            playsinline: '1',
            rel: '0',
            modestbranding: '1',
        });

        return {
            provider: 'youtube',
            videoId: id,
            embedSrc: `https://www.youtube.com/embed/${id}?${params.toString()}`,
        };
    } catch {
        return null;
    }
}

function parseVideoUrl(raw) {
    const url = normalizeVideoInput(raw);
    if (!url) return { error: 'Video URL is required' };

    let parsed;
    try {
        const u = new URL(url);
        const host = u.hostname.replace(/^www\./, '');

        if (isVimeoHost(host)) {
            parsed = parseVimeo(url);
        } else if (isYouTubeHost(host)) {
            parsed = parseYouTube(url);
        } else {
            return { error: 'Only Vimeo and YouTube URLs are allowed' };
        }
    } catch {
        return { error: 'Invalid video URL. Paste the full link from Vimeo or YouTube.' };
    }

    if (!parsed) {
        return { error: 'Could not parse video URL. Use a watch, Shorts, or youtu.be link.' };
    }

    return { ...parsed, videoUrl: url };
}

module.exports = { parseVideoUrl, parseVimeo, parseYouTube, normalizeVideoInput };
