'use strict';

require('dotenv').config();
const express = require('express');
const Pocket = require('./pocket-api');

const PORT = 8451;
const LOCAL_URL = `http://localhost:${PORT}`;
const REDIRECT_PATH = '/results';
const REDIRECT_URI = `${LOCAL_URL}${REDIRECT_PATH}`;

const app = express();
const pocket = new Pocket(process.env.POCKET_CONSUMER_KEY, REDIRECT_URI);

const STYLE =
	'<style>body{max-width:700px;margin:3em auto;font:24px charter,georgia,serif}h1{margin-bottom:0;text-decoration:underline}p{line-height:1.4;margin:1.5em 0}li{margin-block-end:1em}hr{margin-block:1.5em}</style>';

app.get('/', function (req, res) {
	res.send(`<html>
	<head>
		<title>Pocket calculator</title>
		${STYLE}
	</head>
	<body>
		<h1>Pocket calculator</h1>
		<p>To view your Pocket stats, you must first <a href="/auth">authorize this application</a>.</p>
	</body>
</html>`);
});
app.get('/auth', function (req, res) {
	pocket.getRequestToken().then(requestToken => {
		res.redirect(
			`https://getpocket.com/auth/authorize?request_token=${requestToken.code}&redirect_uri=${REDIRECT_URI}`
		);
	});
});
app.get(REDIRECT_PATH, function (req, res) {
	pocket.getAccessToken().then(accessToken => {
		pocket.getArticles({ state: 'all' }).then(response => {
			const articles = Object.values(response.list);
			const articlesByState = articles.reduce(
				(acc, article) => {
					acc[article.status].push(article);
					return acc;
				},
				[[], []]
			);
			const [unreadStats, readStats] = articlesByState.map(list => {
				const wordCount = list.reduce((acc, article) => acc + parseInt(article.word_count), 0);
				const pageCount = Math.round(wordCount / 275);
				const bookCount = (wordCount / 90000).toFixed(1);
				return { count: list.length, wordCount, pageCount, bookCount };
			});
			const [unreadNonArticlesSorted, unreadArticlesSorted] = articlesByState[0]
				.sort((a, b) => b.word_count - a.word_count)
				.reduce(
					(acc, current) => {
						const isArticle = +(+current.word_count && current.is_article === '1');
						acc[isArticle].push(current);
						return acc;
					},
					[[], []]
				);

			const shortestUnreadArticle = unreadArticlesSorted[unreadArticlesSorted.length - 1];
			const longestUnreadArticle = unreadArticlesSorted[0];

			const firstDay =
				1000 * articles.reduce((lowest, cur) => Math.min(lowest, parseInt(cur.time_added)), Infinity);
			const readableFirstDay = new Date(firstDay).toLocaleDateString('en-us', {
				weekday: 'long',
				year: 'numeric',
				month: 'long',
				day: 'numeric',
			});
			const daysActive = Math.ceil((Date.now() - firstDay) / 1000 / 60 / 60 / 24);
			const yearsActive = daysActive / 365.25;
			const unreadArticleCountByDay = Array(daysActive).fill(0);
			const unreadWordCountByDay = Array(daysActive).fill(0);
			const readWordCountByDay = Array(daysActive).fill(0);
			articles.forEach(article => {
				const fromIdx = Math.floor((parseInt(article.time_added) * 1000 - firstDay) / 1000 / 60 / 60 / 24);
				const untilIdx = Math.ceil(
					((parseInt(article.time_read) * 1000 || Date.now()) - firstDay) / 1000 / 60 / 60 / 24
				);
				const wordCount = parseInt(article.word_count);
				for (let i = fromIdx; i <= untilIdx; ++i) {
					unreadArticleCountByDay[i]++;
					unreadWordCountByDay[i] += wordCount;
				}
				if (article.status === '1') {
					for (let i = untilIdx; i < daysActive; ++i) {
						readWordCountByDay[i] += wordCount;
					}
				}
			});
			res.send(`<html>
	<head>
		<title>Pocket calculator</title>
		${STYLE}
	</head>
	<body>
		<h1>Pocket calculator</h1>
		<h2 style="margin-top:0;font-size:0.8em">${
			accessToken.username
		}&nbsp;&nbsp;•&nbsp;&nbsp;<span style="font-weight: normal">${
				new Date().toISOString().split('T')[0]
			}</span></h2>
		<p>You have <strong>${unreadStats.count} unread articles,</strong> with a total word count of <strong>${
				unreadStats.wordCount
			}</strong>. That’s about <strong>${unreadStats.pageCount} pages,</strong> or <strong>${
				unreadStats.bookCount
			} books.</strong></p>
		<p>You have <strong>${readStats.count} read articles,</strong> with a total word count of <strong>${
				readStats.wordCount
			}</strong>. That’s about <strong>${readStats.pageCount} pages,</strong> or <strong>${
				readStats.bookCount
			} books.</strong></p>
		<p>You’ve been using Pocket since <strong>${readableFirstDay},</strong> which means you read an average of <strong>${(
				readStats.bookCount / yearsActive
			).toFixed(1)} books</strong> worth of content per year.</p>
		<div id="graphs"></div>
		${
			unreadArticlesSorted.length > 1 && longestUnreadArticle
				? `<p>Your longest unread article is <a href="${longestUnreadArticle.resolved_url}">${
						longestUnreadArticle.resolved_title || longestUnreadArticle.resolved_url
				  }</a>, at ${longestUnreadArticle.word_count} words.</p>`
				: ''
		}
		${
			unreadArticlesSorted.length > 1 && shortestUnreadArticle
				? `<p>Your shortest unread article is <a href="${shortestUnreadArticle.resolved_url}">${
						shortestUnreadArticle.resolved_title || shortestUnreadArticle.resolved_url
				  }</a>, at ${shortestUnreadArticle.word_count} words.</p>`
				: ''
		}
		${
			unreadArticlesSorted.length
				? `<hr/><h2>Unread articles, sorted by word count</h2><ul>
			${unreadArticlesSorted
				.map(
					article =>
						`<li><a href="${article.resolved_url}">${
							article.resolved_title || article.resolved_url
						}</a>, at <strong>${article.word_count}</strong> word${
							article.word_count === '1' ? '' : 's'
						}.</li>`
				)
				.join('')}
		</ul>`
				: ''
		}
		${
			unreadNonArticlesSorted.length
				? `<hr/><h2>Articles that Pocket couldn’t parse</h2><ul>
			${unreadNonArticlesSorted
				.map(
					article =>
						`<li><a href="${article.resolved_url}">${
							article.resolved_title || article.resolved_url
						}</a>, at <strong>${article.word_count}</strong> word${
							article.word_count === '1' ? '' : 's'
						}.</li>`
				)
				.join('')}
		</ul>`
				: ''
		}
		<script>
			var graphEl = document.getElementById('graphs');
			var graphs = [{
				caption: 'Unread article count over time:',
				data: ${JSON.stringify(unreadArticleCountByDay)},
			}, {
				caption: 'Unread word count over time:',
				data: ${JSON.stringify(unreadWordCountByDay)},
			}, {
				caption: 'Words read over time:',
				data: ${JSON.stringify(readWordCountByDay)},
			}];

			graphs.forEach(({caption, data}) => {
				var max = data.reduce((a, b) => Math.max(a, b), 0);
				var canvas = document.createElement('canvas');
				var ctx = canvas.getContext('2d');
				var p = document.createElement('p');
				p.textContent = caption;

				var w = canvas.width = data.length;
				var h = canvas.height = Math.round(w * 9 / 16);

				var scale = h / max;
				canvas.style.width = '100%';
				canvas.style.marginBottom = '2em';
				canvas.style.imageRendering = 'crisp-edges';

				ctx.fillStyle = '#fff';
				ctx.fillRect(0, 0, w, h);
				ctx.fillStyle = '#000';
				ctx.moveTo(0, h);
				data.forEach((n, i) => {
					ctx.lineTo(i, h - n * scale);
					ctx.lineTo(i + 1, h - n * scale);
				});
				ctx.lineTo(w, h);
				ctx.fill();

				graphEl.append(p);
				graphEl.append(canvas);
			});
		</script>
	</body>
</html>`);
		});
	});
});

app.listen(PORT, () => {
	console.log(`Listening at ${LOCAL_URL}`);
});
