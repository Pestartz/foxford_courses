import path from "path";
import fs from "fs-extra";
import whenDomReady from "when-dom-ready";
import helpers from "../helpers";

class HomeworkMixin {
  constructor() {
    this.homeworkList = [];
  }

  async createHomeworkList() {
    for (let lesson of this.lessonList) {
      let json = await fetch(
        `https://foxford.ru/api/lessons/${lesson.id}/tasks`
      ).then(r => r.json());

      if (json) {
        json.forEach(task => {
          let modTask = task;

          modTask.lessonId = lesson.id;
          this.homeworkList.push(modTask);
        });
      }
    }
  }

  async retrieveHomework() {
    for (let task of this.homeworkList) {
      let taskId = task.id;
      let lessonId = task.lessonId;

      let json = await fetch(
        `https://foxford.ru/api/lessons/${lessonId}/tasks/${taskId}`
      ).then(r => r.json());

      if (
        fs.existsSync(
          path.join(
            nw.App.startPath,
            "output",
            String(this.courseId),
            String(lessonId),
            "homework",
            `${json.name}0.pdf`
          )
        )
      ) {
        continue;
      }

      this.foxFrame.contentWindow.location.href = `https://foxford.ru/lessons/${lessonId}/tasks/${taskId}`;
      await whenDomReady(this.foxFrame.contentWindow.document);

      try {
        let response = await fetch(
          `https://foxford.ru/api/lessons/${lessonId}/tasks/${taskId}/fails`,
          {
            method: "POST",
            headers: {
              "X-CSRF-Token": helpers.getCookie(
                "csrf_token",
                this.foxFrame.contentWindow.document.cookie
              )
            }
          }
        );

        if (response.ok) {
          this.foxFrame.contentWindow.location.href = `https://foxford.ru/lessons/${lessonId}/tasks/${taskId}?reload=true`;
          await whenDomReady(this.foxFrame.contentWindow.document);
        }
      } catch (e) {}

      await new Promise(resolve => setTimeout(resolve, 5500));
      await new Promise(resolve => {
        this.foxFrame.contentWindow.MathJax.Hub.Queue(resolve);
      });

      let contentHeight = this.foxFrame.contentWindow.document.body
        .scrollHeight;

      nw.Window.get().resizeTo(1200, contentHeight);

      let i = 0;
      do {
        let pdf_path = path.join(
          nw.App.startPath,
          "output",
          String(this.courseId),
          String(lessonId),
          "homework",
          `${json.name}${i}.pdf`
        );

        fs.ensureFileSync(pdf_path);

        nw.Window.get().print({
          pdf_path,
          marginsType: 1,
          mediaSize: {
            name: "iPad",
            width_microns: 1200 * 263.6,
            height_microns: 1080 * 263.6,
            custom_display_name: "A4",
            is_default: true
          },
          headerFooterEnabled: false,
          shouldPrintBackgrounds: true
        });

        this.foxFrame.contentWindow.scrollBy(0, 1080);
        contentHeight -= 1080;
        i++;
      } while (contentHeight > 0);
    }
  }
}

export default HomeworkMixin;
