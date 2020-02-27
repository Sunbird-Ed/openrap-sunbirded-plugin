import * as fs from "fs";
import * as  _ from "lodash";
import { Inject, Singleton } from "typescript-ioc";
import * as path from "path";
import { handelError } from "./ITelemetryImport";
import DatabaseSDK from "./../../sdk/database";
import { logger } from "@project-sunbird/ext-framework-server/logger";
import { containerAPI, ISystemQueueInstance, SystemQueueReq } from "OpenRAP/dist/api";
import { manifest } from "../../manifest";
import { ImportTelemetry } from "./telemetryImport";

@Singleton
export class TelemetryImportManager {
  @Inject private dbSDK: DatabaseSDK;
  private systemQueue: ISystemQueueInstance;

  public async initialize() {
    this.systemQueue = containerAPI.getSystemQueueInstance(manifest.id);
    this.systemQueue.register(ImportTelemetry.taskType, ImportTelemetry);
    this.dbSDK.initialize(manifest.id);
  }

  public async add(paths: string[]): Promise<string[]> {
    logger.info("Telemetry import paths added: ", paths);
    paths = await this.getUnregisteredPaths(paths);
    logger.info("Unregistered telemetry import paths:", paths);
    if (!paths || !paths.length) {
      throw {
        errCode: "TELEMETRY_IMPORT_PATH_ADDED_ALREADY",
        errMessage: "All telemetry import paths are added",
      };
    }
    const queueReq: SystemQueueReq[] = [];
    for (const data of paths) {
      const fileSize = await this.getFileSize(data).catch(handelError("TELEMETRY_IMPORT_PATH_NOT_EXIST"));
      const insertData: SystemQueueReq = {
        type: ImportTelemetry.taskType,
        name: path.basename(data),
        metaData: {
          fileSize,
          sourcePath: data,
        },
      };

      queueReq.push(insertData);
    }
    logger.info("Telemetry import added to queue", queueReq);
    const ids = await this.systemQueue.add(queueReq);
    return ids;
  }

  private getFileSize(filePath): Promise<number> {
    return new Promise((resolve, reject) => {
      fs.stat(filePath, (err, stats) => {
        if (err) {
          return reject(err);
        }
        resolve(stats.size);
      });
    });
  }

  private async getUnregisteredPaths(paths: string[]): Promise<string[]> {
    const registeredJobs = await this.systemQueue.query({
      type: ImportTelemetry.taskType,
      name: { $in: paths.map((data) => path.basename(data)) },
      isActive: true,
    });
    logger.debug("---registeredJobs--", JSON.stringify(registeredJobs));
    if (!registeredJobs) {
      return paths;
    }
    logger.debug("---paths--", paths);

    paths = _.filter(paths, (data) => {
      if (_.find(registeredJobs, { sourcePath: data })) {
        logger.log("skipping telemetry import for ", data, " as its already registered");
        return false;
      } else {
        return true;
      }
    });
    return paths;
  }
}
