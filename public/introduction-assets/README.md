# Website introduction screenshots

Real local UI captures taken on 2026-10-04, cropped to exclude account/navigation details. The images are historical interface examples, not live metrics. No reports were generated for these captures.

- news.jpg: `/provident-fund/news`, date range 2026-09-27 to 2026-10-03, news summary/source/score and region/business labels.
- weekly.jpg: `/auto-report`, existing weekly report download history filtered to 公积金.
- regions.jpg: `/policy/regions`, 江苏省全省 selected, first news item and region tree.
- business.jpg: `/provident-fund/business-report`, 贷款 selected, material preview before generation.
- yangzhou.jpg: `/policy/comparison`, existing report selected, before policy extraction.

The shared content references these bundled images. The PDF renderer embeds only the five explicitly allowed local filenames as data URIs and waits for decoding, while keeping network requests disabled. Keep this asset directory separate from the `/introduction` application route to avoid Express static directory redirects.
