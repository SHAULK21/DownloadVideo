"""Beeg API adapter: decimal IDs, current metadata and CDN request headers."""

import re

from yt_dlp.extractor.common import InfoExtractor
from yt_dlp.networking.exceptions import HTTPError
from yt_dlp.utils import ExtractorError, int_or_none, unified_timestamp, url_or_none, urljoin


class OmniGrabBeegIE(InfoExtractor):
    IE_NAME = 'omnigrab:beeg'
    _VALID_URL = r'https?://(?:www\.)?beeg\.com/(?:video/)?-?(?P<id>\d+)(?:[/?#]|$)'

    def _real_extract(self, url):
        video_id = self._match_id(url)
        # Keep the original ID for saved tasks; the API requires decimal syntax.
        api_id = video_id.lstrip('0') or '0'
        headers = {'Origin': 'https://beeg.com', 'Referer': 'https://beeg.com/'}
        try:
            video = self._download_json(
                f'https://store.externulls.com/facts/file/{api_id}', video_id,
                'Downloading Beeg metadata', headers=headers)
        except ExtractorError as error:
            if isinstance(error.cause, HTTPError) and error.cause.status == 404:
                raise ExtractorError('Beeg: видео недоступно или удалено.', expected=True) from error
            raise
        if not isinstance(video, dict) or not isinstance(video.get('file'), dict):
            raise ExtractorError('Beeg: видео недоступно или удалено.', expected=True)
        file = video['file']
        facts = sorted(
            (fact for fact in video.get('fc_facts') or [] if isinstance(fact, dict)),
            key=lambda fact: int_or_none(fact.get('id')) or 0)
        first_fact = next(iter(facts), {})
        stuff = file.get('stuff') if isinstance(file.get('stuff'), dict) else {}
        metadata = {
            item['cd_column']: item.get('cd_value')
            for item in file.get('data') or []
            if isinstance(item, dict) and isinstance(item.get('cd_column'), str)
        }
        formats, subtitles, seen = [], {}, set()
        for source in [file, *facts]:
            for key in ('hls_resources', 'resources'):
                resources = source.get(key)
                if not isinstance(resources, dict):
                    continue
                for format_id, uri in resources.items():
                    if not isinstance(uri, str):
                        continue
                    media_url = url_or_none(urljoin('https://video.externulls.com/', uri))
                    if not media_url or media_url in seen:
                        continue
                    seen.add(media_url)
                    match = re.search(r'(\d+)$', str(format_id))
                    height = int_or_none(match.group(1)) if match else None
                    if key == 'hls_resources':
                        fmts, subs = self._extract_m3u8_formats_and_subtitles(
                            media_url, video_id, 'mp4', m3u8_id=str(format_id),
                            headers=headers, fatal=False)
                        self._merge_subtitles(subs, target=subtitles)
                    else:
                        fmts = [{'url': media_url, 'format_id': str(format_id)}]
                    for fmt in fmts:
                        if height and not fmt.get('height'):
                            fmt['height'] = height
                        fmt['http_headers'] = {**fmt.get('http_headers', {}), **headers}
                    formats.extend(fmts)
        if not formats:
            raise ExtractorError(
                'Beeg не вернул доступный поток. Включите видео в браузере, затем '
                'выберите обнаруженный HLS/MP4 в значке расширения OmniGrab.', expected=True)
        return {
            'id': video_id,
            'display_id': str(first_fact['id']) if first_fact.get('id') is not None else None,
            'title': stuff.get('sf_name') or metadata.get('sf_name') or f'Beeg {video_id}',
            'description': stuff.get('sf_story') or metadata.get('sf_story'),
            'duration': int_or_none(file.get('fl_duration')),
            'timestamp': unified_timestamp(first_fact.get('fc_created')),
            'tags': [tag['tg_name'] for tag in video.get('tags') or []
                     if isinstance(tag, dict) and isinstance(tag.get('tg_name'), str)],
            'age_limit': 18,
            'formats': formats,
            'subtitles': subtitles,
            'http_headers': headers,
        }
