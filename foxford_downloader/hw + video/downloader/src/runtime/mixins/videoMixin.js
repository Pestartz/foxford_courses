import path from "path";
import glob from "glob";
import child_process from "child_process";
import waitPort from "wait-port";
import sanitize from "sanitize-filename";

import helpers from "../helpers";

class VideoMixin {
  constructor() {
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

      let webinarSource = await fetch(
        `https://foxford.ru/groups/${webinar_id}`
      ).then(r => r.text());

      let webinarDOM = new DOMParser().parseFromString(
        webinarSource,
        "text/html"
      );

      let erlyFrame = webinarDOM.querySelector("div.full_screen > iframe");

      this.foxFrame.contentWindow.location.href = erlyFrame.src;

      await helpers.waitFor(() =>
        this.foxFrame.contentWindow.document.querySelector("video")
      );

      let videoLink;

      try {
        let videoEl = this.foxFrame.contentWindow.document.querySelector(
          "#integros_player > div > div > video"
        );

        if (videoEl) {
          videoLink = videoEl.dataset.originalSrc;
        } else {
          throw new Error("Next player type");
        }
      } catch (e) {
        let videoEl = this.foxFrame.contentWindow.document.querySelector(
          "video.video-react-video > source"
        );

        if (videoEl) {
          videoLink = videoEl.src;
        } else {
          throw new Error("Unknown player type");
        }
      }

      this.videoList.push({
        url: videoLink,
        lessonId: id,
        fname: sanitize(`${lesson.title || webinar_id}.mp4`)
      });
    }
  }

  async createDownloadTasksList() {
    let downloadTasks = [];

    for (let video of this.videoList) {
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
