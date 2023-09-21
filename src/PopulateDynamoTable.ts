import { Context, Handler } from "aws-lambda";
import { randomUUID } from "crypto";
import { Utilities } from "./Utilities";
import { TranslateClient, TranslateTextCommand, TranslateTextCommandInput } from "@aws-sdk/client-translate";
import { DeleteBucketCommand, DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PassThrough } from "stream";
import phrases from "./phrases.json";

const phraseFileName = "phrases.json";

const translateClient = new TranslateClient({});
const s3Client = new S3Client({});
const S3_BUCKET_NAME = process.env["S3_BUCKET_NAME"] || "";

export const handler: Handler = async (event: any, context: Context) => {
    try {

        console.log(`event: ${JSON.stringify(event)}`);
        console.log(`context: ${context}`);

        const response: any = {};

        if (event["RequestType"] === "Delete") {
            try {
                const bucketObjects = await s3Client.send(new ListObjectsV2Command({ Bucket: S3_BUCKET_NAME }))
                if (bucketObjects.Contents && bucketObjects.Contents.length > 0) {
                    for (const bucketObject of bucketObjects.Contents) {
                        const result = await s3Client.send(new DeleteObjectCommand({
                            Bucket: S3_BUCKET_NAME,
                            Key: bucketObject.Key
                        }))
                        console.log(result)
                    }
                }
                await s3Client.send(new DeleteBucketCommand({ Bucket: S3_BUCKET_NAME }))
                await Utilities.cloudFormationSend(event, context, "SUCCESS", response);
                return;
            } catch (err) {
                await Utilities.cloudFormationSend(event, context, "FAILED", response);
                console.log(`Custom resource lambda execution for delete has failed: ${err}`);
                return;
            }
        } else if (event["RequestType"] === "Create") {
            // request type is create
            try {
                await populatePhraseTable();
                console.log(`Custom resource lambda execution for response_data: ${JSON.stringify(response)}`);
                await Utilities.cloudFormationSend(event, context, "SUCCESS", response);
            } catch (err) {
                await Utilities.cloudFormationSend(event, context, "FAILED", response);
                console.log(`Lambda execution has failed: ${err}`);
                return;
            }
        } else {
            try {
                console.log(`Custom resource lambda execution for response_data: ${JSON.stringify(response)}`);
                await Utilities.cloudFormationSend(event, context, "SUCCESS", response);
            } catch (err) {
                await Utilities.cloudFormationSend(event, context, "FAILED", response);
                console.log(`Lambda execution has failed: ${err}`);
                return;
            }
        }
    } catch (err) {
        await Utilities.cloudFormationSend(event, context, "FAILED", {});
        console.log(`Lambda execution has failed unexpectedly, unknown request type (probably a debugging code issue): ${err}`);
        return;
    }
};

async function populatePhraseTable() {
    const passThrough = new PassThrough();

    for (const phrase of phrases) {
        const translateInput = {
            Text: phrase.Item.phrase.S,
            SourceLanguageCode: phrase.Item.phraseLanguage.S,
            TargetLanguageCode: phrase.Item.translationLanguage.S
        } as TranslateTextCommandInput;
        console.log(phrase.Item.phrase.S);
        const translateCommand = new TranslateTextCommand(translateInput);
        const result = await translateClient.send(translateCommand);
        console.log(result.TranslatedText);

        const translatedPhrase = structuredClone(phrase);
        translatedPhrase.Item.id.S = randomUUID();
        translatedPhrase.Item.correctTranslation.S = result.TranslatedText || "";
        passThrough.write(`${JSON.stringify(translatedPhrase)}\n`);
    }

    const endedPassthrough = passThrough.end();
    const allContent = endedPassthrough.read(endedPassthrough.readableLength) as Buffer;
    try {
        const response = await s3Client.send(new PutObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: phraseFileName,
            Body: allContent
        }));
        console.log(response);
    } catch (err) {
        console.error(err);
    }
}