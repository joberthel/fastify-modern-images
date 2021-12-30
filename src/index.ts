import sharp from 'sharp';
import fp from 'fastify-plugin';
import { Stream } from 'stream';
import merge from 'lodash/merge';
import { stream2buffer } from './utils';
import { FastifyInstance } from 'fastify';

const imageFormats = <const>['avif', 'webp', 'jpeg', 'png'];

export type ImageFormat = typeof imageFormats[number];

export type FastifyModernImagesOptions = {
    regex?: RegExp;
    quality?: string;
    compression?: {
        enabled?: boolean;
        format?: ImageFormat;
        priority?: number;
        alpha?: boolean;
        quality?: Record<string, number>;
        options?: Record<string, any>;
        contentType?: string;
        supported?: (accept: string) => boolean;
    }[];
};

const defaults: FastifyModernImagesOptions = {
    regex: /.*/,
    quality: '7',
    compression: [
        {
            enabled: true,
            format: 'jpeg',
            priority: 2,
            alpha: false,
            quality: {
                '9': 95,
                '8': 90,
                '7': 85,
                '6': 80,
                '5': 75,
                '4': 70,
                '3': 60,
                '2': 50,
                '1': 40
            },
            options: {},
            contentType: 'image/jpeg',
            supported: () => true
        },
        {
            enabled: true,
            format: 'avif',
            priority: 4,
            alpha: true,
            quality: {
                '9': 87,
                '8': 77,
                '7': 66,
                '6': 59,
                '5': 54,
                '4': 49,
                '3': 41,
                '2': 37,
                '1': 33
            },
            options: {
                speed: 7
            },
            contentType: 'image/avif',
            supported: accept => accept.includes('image/avif')
        },
        {
            enabled: true,
            format: 'webp',
            priority: 3,
            alpha: true,
            quality: {
                '9': 94,
                '8': 89,
                '7': 84,
                '6': 77,
                '5': 71,
                '4': 63,
                '3': 46,
                '2': 37,
                '1': 31
            },
            options: {},
            contentType: 'image/webp',
            supported: accept => accept.includes('image/webp')
        },
        {
            enabled: true,
            format: 'png',
            priority: 1,
            alpha: true,
            quality: {
                '9': 100,
                '8': 100,
                '7': 100,
                '6': 100,
                '5': 100,
                '4': 100,
                '3': 100,
                '2': 100,
                '1': 100
            },
            options: {},
            contentType: 'image/png',
            supported: () => true
        }
    ]
};

export async function fastifyModernImages(fastify: FastifyInstance, opts?: FastifyModernImagesOptions) {
    const options: FastifyModernImagesOptions = merge(defaults, opts || {});

    // @ts-expect-error
    const contentTypes: string[] = options.compression?.map(item => item.contentType);

    fastify.addHook('onSend', async (request, reply, payload) => {
        if (!options.regex?.test(request.raw.url || '')) {
            return payload;
        }

        const contentType = reply.getHeader('Content-Type') || '';

        if (!contentTypes.includes(contentType) || !(payload instanceof Stream || payload instanceof Buffer)) {
            return payload;
        }

        if (payload instanceof Stream) {
            payload = await stream2buffer(payload);
        }

        const instance = sharp(payload as Buffer);
        const metadata = await instance.metadata();

        // @ts-expect-error
        const supportedFormats = options.compression
            // @ts-expect-error
            .filter(item => item.enabled && (!metadata.hasAlpha || item.alpha) && item.supported(request.headers.accept))
            // @ts-expect-error
            .sort((a, b) => b.priority - a.priority);

        if (supportedFormats.length == 0) {
            return payload;
        }

        reply.header('Content-Type', supportedFormats[0].contentType);

        const quality = options.quality;

        // @ts-expect-error
        return instance.toFormat(supportedFormats[0].format as any, merge(supportedFormats[0].options, { quality: supportedFormats[0].quality[quality] })).toBuffer();
    });
}

export default fp(fastifyModernImages, {
    fastify: '3.x',
    name: 'fastify-modern-images'
});
