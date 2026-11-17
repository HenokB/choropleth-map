// Optional packaging for static hosts. The source itself is already runnable.
import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist');
for (const file of ['index.html', 'guide.html', 'styles', 'src', 'assets', 'examples']) {
  await cp(file, 'dist/' + file, { recursive: true });
}
console.log('Static site ready in dist/');
