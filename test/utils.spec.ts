import chai from 'chai';
import { PassThrough } from 'stream';
import { stream2buffer } from '../src/utils';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

const { expect } = chai;

describe('utils', () => {
    it('should convert stream to buffer', async () => {
        let stream = new PassThrough();
        stream.write('foo bar');
        stream.end();

        expect((await stream2buffer(stream)).toString()).to.eq('foo bar');

        stream = new PassThrough();
        stream.write('foo bar');
        stream.destroy(new Error('foo-bar'));

        await expect(stream2buffer(stream)).to.eventually.be.rejectedWith('error converting stream - Error: foo-bar');
    });
});
