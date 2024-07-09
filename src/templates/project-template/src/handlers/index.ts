import AppInfo from "@/modules/AppInfo";
import {
    HttpHandler,
    HttpHandlerReq,
    HttpHandlerRes,
} from "@/modules/HttpHandler";
export default class HandlerIndex extends HttpHandler {
    protected envAppInfo = this.env<AppInfo>("appInfo");

    async get(req: HttpHandlerReq, res: HttpHandlerRes) {
        const hint = req.hint;

        const appInfo = this.envAppInfo;

        console.trace(hint, "Incoming request received.");

        res.set("Content-Type", "text/html").send(
            `It works! ${appInfo.name}/${
                appInfo.version
            }(${appInfo.commit.slice(0, 8)})`
        );
    }
}
