import { Context } from "aws-lambda";
import * as https from "https";
import * as http from "http";

export type CloudFormationResponseStatus = "SUCCESS" | "FAILED"

export class Utilities {

    static async cloudFormationSend(
        event: any, context: Context,
        responseStatus: CloudFormationResponseStatus,
        responseData: any, physicalResourceId = "",
        noEcho = false, reason = ""
    ) {
        const responseUrl = event["ResponseURL"];
        console.log(responseUrl);

        if (reason === "") {
            reason = `See the details in CloudWatch Log Stream: ${context.logStreamName}`;
        }

        if (physicalResourceId === "") {
            physicalResourceId = context.logStreamName;
        }

        const responseBody = {
            "Status": responseStatus,
            "Reason": reason,
            "PhysicalResourceId": physicalResourceId,
            "StackId": event["StackId"],
            "RequestId": event["RequestId"],
            "LogicalResourceId": event["LogicalResourceId"],
            "NoEcho": noEcho,
            "Data": responseData
        };

        console.log("Response body:");
        console.log(responseBody);

        try {
            const result = await Utilities.httpPut(responseUrl, JSON.stringify(responseBody));
            console.log(`Status code: ${result.statusCode}`);
        } catch (err) {
            console.log("CloudFormationResponseHandler.Send() failed executing http(s).request():");
            console.log(err);
        }
    }

    private static async httpPut(url: string, data: string)
        : Promise<{ statusCode: number, headers: any, body: any }> {
        let client: typeof https | typeof http;

        if (url.startsWith("http://")) {
            client = http;
        } else if (url.startsWith("https://")) {
            client = https;
        }

        return new Promise((resolve, reject) => {
            function handleRequest(res: http.IncomingMessage) {

                const chunks: any = [];

                res.on("data", chunk => chunks.push(chunk));
                res.on("error", reject);
                res.on("end", async () => {
                    const { statusCode, headers } = res;
                    const body = chunks.join("");

                    if (statusCode && statusCode >= 200 && statusCode <= 299) {
                        resolve({ statusCode, headers, body });
                    } else {
                        reject(new Error(`Request failed. status: ${statusCode}`));
                    }
                });
            }

            const req = client.request(url, {
                method: "PUT",
                headers: {
                    "content-type": "",
                    "content-length": data.length.toString()
                }
            }, handleRequest);
            req.on("error", reject);
            req.write(data);
            req.end();
        });
    }
}