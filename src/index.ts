import { XY } from './types';
import { PolylinePart, intersectCirclePolyline, linkIntersections } from './clip';

let seed = 1;

function rnd() {
	seed = (seed * 0x93d765dd) >>> 0;
	return seed;
}

function drawPolygon(gc: CanvasRenderingContext2D, ring: XY[]) {
	for(let n = 0; n < ring.length; ++n) {
		const { x, y } = ring[n];

		if(!n) {
			gc.moveTo(x, y);
		} else {
			gc.lineTo(x, y);
		}
	}
}

function main(doc: Document) {
	let ring: XY[] = [];

	const quant = 7;
	for(let n = 0; n < 100; ++n) {
		// const x = ((rnd() >>> (22 + quant)) << quant) + 128;
		// const y = ((rnd() >>> (22 + quant)) << quant) + 128;
		const x = rnd() / 65536 / 64 + 128;
		const y = rnd() / 65536 / 64 + 128;

		ring.push({ x, y });
	}

	let x = 512 + 128;
	let y = 512 + 128;

	let canvas = doc.createElement('canvas');
	canvas.width = 1024 + 256;
	canvas.height = 1024 + 256;
	canvas.style.position = 'absolute';
	doc.body.appendChild(canvas);
	let gc = canvas.getContext('2d')!;

	gc.fillStyle = '#0002';
	gc.lineWidth = 1;
	gc.strokeStyle = '#0004';
	gc.beginPath();

	drawPolygon(gc, ring);

	gc.closePath();
	gc.fill('evenodd');
	gc.stroke();

	canvas = doc.createElement('canvas');
	canvas.width = 1024 + 256;
	canvas.height = 1024 + 256;
	canvas.style.position = 'absolute';
	doc.body.appendChild(canvas);
	gc = canvas.getContext('2d')!;

	const rect = canvas.getBoundingClientRect();

	canvas.addEventListener('mousemove', (event) => {
		const x = event.offsetX - rect.left;
		const y = event.offsetY - rect.top;
		const r = 250;

		gc.clearRect(0, 0, canvas.width, canvas.height);

		gc.fillStyle = '#fff';
		gc.lineWidth = 1;
		gc.strokeStyle = '#0c08';
		gc.beginPath();

		gc.arc(x, y, r, 0, Math.PI * 2);

		gc.closePath();
		gc.fill('evenodd');
		gc.stroke();

		gc.fillStyle = '#0604';
		gc.lineWidth = 2;
		gc.strokeStyle = '#060';

		const center = { x, y };
		const rings = [ring];
		const parts: PolylinePart[][] = [];

		intersectCirclePolyline(center, r, rings, true, parts);
		linkIntersections(gc, center, r, parts);
	});
}

if(typeof window == 'object') main(globalThis.document);
