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
	return group.all.every((t) => repo.topics.includes(t)) && !group.none.some((t) => repo.topics.includes(t));
}

function renderRepo(repo) {
	const links = [`<a href="${escapeHtml(repo.html_url)}">Code</a>`];
	if (repo.homepage) {
		links.push(`<a href="${escapeHtml(repo.homepage)}">Website</a>`);
	}
	const meta = [`updated ${repo.pushed_at.slice(0, 10)}`];
	if (repo.stargazers_count) {
		meta.push(`★ ${repo.stargazers_count}`);
	}
	if (repo.fork) {
		meta.push("fork");
	}
	return `<article class="repo">
	<h3><a href="${escapeHtml(repo.html_url)}">${escapeHtml(repo.name)}</a></h3>
	<p class="description">${escapeHtml(repo.description)}</p>
	<p class="meta">${meta.join(" · ")}</p>
	<p class="links">${links.join(" ")}</p>
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

const sections = config.groups
	.map((g) => [g, repos.filter((r) => matches(r, g))])
	.filter(([, list]) => list.length)
	.map(([g, list]) => renderGroup(g, list));

const html = template
	.replaceAll("{{title}}", escapeHtml(config.title))
	.replaceAll("{{intro}}", escapeHtml(config.intro))
	.replaceAll("{{user}}", escapeHtml(config.user))
	.replaceAll("{{groups}}", sections.join("\n"))
	.replaceAll("{{date}}", new Date().toISOString().slice(0, 10));

await mkdir("dist", { recursive: true });
await writeFile("dist/index.html", html);
console.log(`built ${sections.length} groups`);
