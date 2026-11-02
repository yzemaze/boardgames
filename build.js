import { readFile, writeFile, mkdir } from "node:fs/promises";

const config = JSON.parse(await readFile("config.json", "utf8"));
const template = await readFile("template.html", "utf8");

const headers = { Accept: "application/vnd.github+json" };
if (process.env.GITHUB_TOKEN) {
	headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

async function fetchRepos(user) {
	const repos = [];
	for (let page = 1; ; page++) {
		const res = await fetch(`https://api.github.com/users/${user}/repos?type=owner&per_page=100&page=${page}`, { headers });
		if (!res.ok) {
			throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
		}
		const batch = await res.json();
		repos.push(...batch);
		if (batch.length < 100) {
			return repos;
		}
	}
}

function escapeHtml(str) {
	return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
}

function matches(repo, group) {
	const has = (t) => repo.topics.includes(t);
	return group.all.every(has)
		&& (!group.any || group.any.some(has))
		&& !group.none.some(has);
}

function renderRepo(repo) {
	return `<article class="repo">
	<h3><a href="${escapeHtml(repo.homepage || repo.html_url)}">${escapeHtml(repo.name)}</a></h3>
	<p>${escapeHtml(repo.description)}</p>
</article>`;
}

function renderGroup(group, repos) {
	return `<section id="${group.id}" class="group">
<h2>${escapeHtml(group.title)}</h2>
<div class="repoGrid">
${repos.map(renderRepo).join("\n")}
</div>
</section>`;
}

const repos = (await fetchRepos(config.user))
	.filter((r) => !r.archived && !r.private)
	.sort((a, b) => a.name.localeCompare(b.name));

const groups = config.groups
	.map((g) => [g, repos.filter((r) => matches(r, g))])
	.filter(([, list]) => list.length);
const sections = groups.map(([g, list]) => renderGroup(g, list));
const toc = groups.map(([g]) => `<a href="#${g.id}">${escapeHtml(g.title)}</a>`);

const html = template
	.replaceAll("{{title}}", escapeHtml(config.title))
	.replaceAll("{{intro}}", escapeHtml(config.intro))
	.replaceAll("{{user}}", escapeHtml(config.user))
	.replaceAll("{{toc}}", toc.join("\n"))
	.replaceAll("{{groups}}", sections.join("\n"));

await mkdir("dist", { recursive: true });
await writeFile("dist/index.html", html);
console.log(`built ${sections.length} groups`);
