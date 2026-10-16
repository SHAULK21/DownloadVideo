"""OmniGrab's local LuluStream adapter. Packed scripts are decoded as data only."""

import re

from yt_dlp.extractor.common import InfoExtractor
from yt_dlp.utils import (
    ExtractorError,
    decode_packed_codes,
    determine_ext,
    float_or_none,
    url_or_none,
    urljoin,
)


class OmniGrabLuluIE(InfoExtractor):
    IE_NAME = 'omnigrab:lulu'
    _VALID_URL = r'https?://(?:www\.)?(?:luluvido|luluvid|lulustream)\.com/(?:[ed]/|embed-)?(?P<id>[a-z0-9]{12})(?:[/?#.]|$)'

    def _real_extract(self, url):
        video_id = self._match_id(url)
        # Download pages use a different layout; the embed contains player sources.
        page_url = urljoin(url, f'/e/{video_id}')
        webpage = self._download_webpage(page_url, video_id)
        data = self._find_jwplayer_data(webpage, video_id)
        if not data:
            for script in re.findall(r'(?s)<script\b[^>]*>(.*?)</script\s*>', webpage):
                if not re.search(r'eval\(function\(p,a,c,k,e,d\)', script):
                    continue
                try:
                    # Never execute scripts from the site (including ads).
                    decoded = decode_packed_codes(script).replace(r"\'", "'")
                except (AttributeError, IndexError, ValueError):
                    continue
                data = self._find_jwplayer_data(decoded, video_id)
                if data:
                    break
        if not data:
            raise ExtractorError(
                'Не найден источник LuluStream. Включите видео в браузере и выберите поток в расширении OmniGrab.',
                expected=True)

        headers = {'Referer': page_url}
        formats, subtitles = [], {}
        for source in data.get('sources') or [data]:
            if not isinstance(source, dict):
                continue
            media_url = url_or_none(urljoin(page_url, source.get('file')))
            if not media_url:
                continue
            ext = determine_ext(media_url)
            if ext == 'm3u8' or source.get('type') == 'hls':
                fmts, subs = self._extract_m3u8_formats_and_subtitles(
                    media_url, video_id, 'mp4', m3u8_id='hls', headers=headers)
                formats.extend(fmts)
                self._merge_subtitles(subs, target=subtitles)
            elif ext == 'mpd' or source.get('type') == 'dash':
                fmts, subs = self._extract_mpd_formats_and_subtitles(
                    media_url, video_id, mpd_id='dash', headers=headers)
                formats.extend(fmts)
                self._merge_subtitles(subs, target=subtitles)
            elif ext in ('mp4', 'webm', 'mkv', 'mov', 'm4v'):
                formats.append({'url': media_url, 'ext': ext})
        if not formats:
            raise ExtractorError('LuluStream не вернул доступный видеопоток.', expected=True)
        for fmt in formats:
            fmt['http_headers'] = {**fmt.get('http_headers', {}), **headers}
        return {
            'id': video_id,
            'title': data.get('title') or self._html_extract_title(webpage) or video_id,
            'thumbnail': urljoin(page_url, data.get('image')),
            'duration': float_or_none(data.get('duration')),
            'formats': formats,
            'subtitles': subtitles,
            'http_headers': headers,
            'webpage_url': url,
        }
