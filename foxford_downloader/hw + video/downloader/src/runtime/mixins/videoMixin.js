import path from "path";
import glob from "glob";
import child_process from "child_process";
import waitPort from "wait-port";
import whenDomReady from "when-dom-ready";
import sanitize from "sanitize-filename";

import helpers from "../helpers";

class VideoMixin {
  constructor() {
    this.accessToken = null;
    this.videoList = [];
  }

  async createVideoList() {
    for (let lesson of this.lessonList) {
      let id = lesson.id;

      let json = await fetch(
        `https://foxford.ru/api/courses/${this.courseId}/lessons/${id}`
      ).then(r => r.json());

      if (json.webinar_status !== "video_available") {
        continue;
      }

      let webinar_id = json.webinar_id;

      if (json.access_state === "available") {
        this.foxFrame.contentWindow.location.href = `https://foxford.ru/groups/${webinar_id}`;

        await whenDomReady(this.foxFrame.contentWindow.document);

        let erlyFrame = await helpers.waitFor(() =>
          this.foxFrame.contentWindow.document.querySelector(
            "div.full_screen > iframe"
          )
        );

        await whenDomReady(erlyFrame.contentWindow.document);

        if (lesson.type === "intro") {
          this.accessToken = new URL(erlyFrame.src).searchParams.get(
            "access_token"
          );
        }

        let videoEl = await helpers.waitFor(() =>
          erlyFrame.contentWindow.document.querySelector(
            "video.video-react-video > source"
          )
        );

        this.videoList.push({
          url: videoEl.src,
          lessonId: id,
          fname: sanitize(`${lesson.title || webinar_id}.mp4`)
        });
      } else {
        let video_id = webinar_id + 12000;

        this.videoList.push({
          url: `https://storage.netology-group.services/api/v1/buckets/hls.webinar.foxford.ru/sets/${video_id}/objects/master.m3u8?access_token=${
            this.accessToken
          }`,
          lessonId: id,
          fname: sanitize(`${lesson.title || webinar_id}.mp4`)
        });
      }
    }
  }

  async createDownloadTasksList() {
    let downloadTasks = [];

    for (let video of this.videoList) {
      try {
        let response = await fetch(video.url);

        if (!response.ok) {
          throw new Error("Video unavaliable");
        }
      } catch (e) {
        continue;
      }

      downloadTasks.push({
        title: video.fname,
        task: `
        () => {
          return new Observable(async taskObserver => {
            let outPath = path.join(
              cwd,
              "output",
              "${this.courseId}",
              "${video.lessonId}",
              "${video.fname}"
            );

            await new Promise((resolve, reject) => {
              let command = ffmpeg({ source: "${video.url}" })
                .audioCodec("copy")
                .videoCodec("copy")
                .outputOptions(["-bsf:a aac_adtstoasc", "-preset superfast"])
                .save(outPath);

              command.on("start", () => {
                fs.ensureFileSync(outPath);
                taskObserver.next("N/A [0 kbps]");
              });

              command.on("progress", progress =>
                taskObserver.next(
                  \`\${progress.timemark} [\${progress.currentKbps} kbps]\`
                )
              );

              command.on("error", err => {
                taskObserver.complete();
                reject(err);
              });

              command.on("end", () => {
                taskObserver.complete();
                resolve();
              });
            });
          });
        }`
      });
    }

    return downloadTasks;
  }

  async delegateDownloadTasks(downloadTasks) {
    let taskServer = glob.sync(path.join(nw.App.startPath, "task-server*"))[0];

    switch (process.platform) {
      case "win32":
        child_process
          .spawn("start", ["cmd", "/k", `"${taskServer}"`], {
            detached: true,
            stdio: "ignore"
          })
          .unref();

        break;

      case "linux":
        child_process
          .spawn("xterm", ["-e", `"${taskServer}"`], {
            detached: true,
            stdio: "ignore"
          })
          .unref();

        break;

      case "darwin":
        child_process
          .spawn("open", ["-a", "Terminal.app", `"${taskServer}"`], {
            detached: true,
            stdio: "ignore"
          })
          .unref();

        break;

      default:
        break;
    }

    await waitPort({ host: "localhost", port: 3001 });

    await fetch("http://localhost:3001/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(downloadTasks)
    });
  }
}

export default VideoMixin;
