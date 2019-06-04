import DatabaseSDK from '../sdk/database/index';
import { Inject } from 'typescript-ioc';
import * as path from 'path';
import { Manifest, } from '@project-sunbird/ext-framework-server/models';
import * as glob from 'glob';
import * as _ from "lodash";
import Response from './../utils/response'
import { logger } from '@project-sunbird/ext-framework-server/logger';
import { containerAPI } from 'OpenRAP/dist/api';

export class Channel {
    @Inject
    private databaseSdk: DatabaseSDK;

    private fileSDK;

    constructor(manifest: Manifest) {
        this.databaseSdk.initialize(manifest.id);
        this.fileSDK = containerAPI.getFileSDKInstance(manifest.id);
    }

    public async insert() {
        let channelFiles = this.fileSDK.getAbsPath(path.join('data', 'channels', '**', '*.json'));
        let files = glob.sync(channelFiles, {});

        for (let file of files) {
            let channel = await this.fileSDK.readJSON(file);
            let _id = path.basename(file, path.extname(file));
            let doc = _.get(channel, 'result.channel');
            await this.databaseSdk.upsert('channel', _id, doc).catch(err => {
                logger.error(`Received error while upserting the ${_id} to channel database ${err.message} ${err.reason}`)
            });
        };
    }


    get(req, res) {
        let id = req.params.id;
        logger.info(`Getting the data from channel database with id: ${id}`)
        this.databaseSdk.get('channel', id)
            .then(data => {
                logger.info(`Received data with id: ${id} in channel database and received response: ${data}`)
                data = _.omit(data, ['_id', '_rev'])
                let resObj = {
                    channel: data
                }
                return res.send(Response.success("api.channel.read", resObj));
            })
            .catch(err => {
                logger.error(`Received error while getting the data from channel database with id: ${id} and err.message: ${err.message} and err.reason: ${err.reason}`)
                if (err.statusCode === 404) {
                    res.status(404)
                    return res.send(Response.error("api.channel.read", 404));
                } else {
                    let statusCode = err.statusCode || 500;
                    res.status(statusCode)
                    return res.send(Response.error("api.channel.read", statusCode));
                }
            });
    }
}