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

      let response;

      try {
        response = await fetch(
          `https://foxford.ru/api/lessons/${lessonId}/tasks/${taskId}`
        );

        if (!response.ok) {
          throw new Error("Homework unavaliable");
        }
      } catch (e) {
        break;
      }

      let json = await response.json();

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

      let pdf_path = path.join(
        nw.App.startPath,
        "output",
        String(this.courseId),
        String(lessonId),
        "homework",
        `${json.name}.pdf`
      );

      fs.ensureFileSync(pdf_path);

      nw.Window.get().print({
        pdf_path,
        marginsType: 1,
        mediaSize: {
          name: "iPad",
          width_microns: 270929,
          height_microns: 361416,
          custom_display_name: "A4",
          is_default: true
        },
        headerFooterEnabled: false,
        shouldPrintBackgrounds: true
      });
    }
  }
}

export default HomeworkMixin;
