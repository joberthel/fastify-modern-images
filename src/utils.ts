import { Stream } from 'stream';
import { Metadata } from 'sharp';
import { FastifyModernImagesOptionsCompression } from './types';
import { spawn } from 'child_process';

export async function stream2buffer(stream: Stream): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
        const _buf = Array<any>();

        stream.on('data', chunk => _buf.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(_buf)));
        stream.on('error', err => reject(`error converting stream - ${err}`));
    });
}

export function guard(regex: RegExp, path: string = '/'): boolean {
    return regex.test(path);
}

export function validatePayload(contentType: string | string[] | number = '', validContentTypes: string[], payload: unknown): boolean {
    if (Array.isArray(contentType) || typeof contentType === 'number') {
        return false;
    }

    return validContentTypes.includes(contentType) && (isStream(payload) || Buffer.isBuffer(payload));
}

export function getBestFormat(accept: string = '', metadata: Metadata, formats: FastifyModernImagesOptionsCompression[]): FastifyModernImagesOptionsCompression | false {
    // @ts-expect-error
    formats = formats.filter(item => item.enabled && (!metadata.hasAlpha || item.alpha) && item.supported(accept)).sort((a, b) => b.priority - a.priority);

    if (formats.length > 0) {
        return formats[0];
    }

    return false;
}

export function isStream(stream: any) {
    return stream !== null && typeof stream === 'object' && typeof stream.pipe === 'function';
}

export function removeBackground(input: Buffer, model = 'u2netp'): Promise<Buffer> {
    const child = spawn('rembg', ['i', '-m', model]);

    return new Promise(resolve => {
        child.stdin.write(input, () => {
            child.stdin.end();

            resolve(stream2buffer(child.stdout));
        });
    });
}
