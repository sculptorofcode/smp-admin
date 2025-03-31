const express = require("express");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");
const path = require("path");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const cookieParser = require("cookie-parser");
const querystring = require("querystring");
const multer = require("multer");
const {
  initializeApp,
  applicationDefault,
  cert,
} = require("firebase-admin/app");
const {
  getFirestore,
  Timestamp,
  FieldValue,
  Filter,
} = require("firebase-admin/firestore");

// bootstrap
const app = express();
const port = 3000;

// Set view engine to EJS
app.set("view engine", "ejs");

var serviceAccount = require("./controller/smart-classroom.json");
const { and } = require("firebase/firestore");
const { list } = require("firebase/storage");

app.use(express.json());
app.use(express.static(__dirname + "/node_modules/bootstrap/dist"));
app.use(express.static(__dirname + "/node_modules/jquery/dist"));
app.use(express.static(__dirname + "/node_modules/axios/dist"));
app.use(express.static(__dirname + "/node_modules/sweetalert2/dist"));
app.use(express.static(__dirname + "/node_modules/bootstrap-icons/font"));
app.use(express.static(__dirname + "/node_modules/datatables.net-dt"));
app.use(express.static(__dirname + "/node_modules/datatables.net"));
app.use(express.static(__dirname + "/node_modules/driver.js/dist"));
app.use(express.static(__dirname + "/node_modules/excel4node"));
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));
// Set views directory
app.set("views", path.join(__dirname, "public/templates"));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://smart-classroom-sgp-default-rtdb.firebaseio.com",
});

const db = admin.database();
const _fire = admin.firestore();
// Configure multer storage
const storage = multer.memoryStorage();
const upload = multer({ storage });
const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});

function addOrdinalSuffix(num) {
  const lastDigit = num % 10;
  const lastTwoDigits = num % 100;

  if (lastDigit === 1 && lastTwoDigits !== 11) {
    return num + "st";
  } else if (lastDigit === 2 && lastTwoDigits !== 12) {
    return num + "nd";
  } else if (lastDigit === 3 && lastTwoDigits !== 13) {
    return num + "rd";
  } else {
    return num + "th";
  }
}

app.get("/", (req, res) => {
  const query = req.url.slice(req.url.indexOf("?") + 1);
  const decodedQuery = querystring.parse(query);
  const message = decodedQuery.message;
  res.render("login", { errorMessage: message });
});

app.post("/login", async (req, res) => {
  const username = req.body.email;
  const password = req.body.password;
  if (username != "" && password != "") {
    try {
      const user = await db.ref("users/admin").get();
      if (user.val().email == username) {
        const isPasswordMatch = await bcrypt.compare(
          password,
          user.val().password
        );
        if (isPasswordMatch) {
          const sessionId = uuidv4();
          await db.ref("users/admin").update({
            lastLogin: new Date().toISOString(),
            session: sessionId,
          });
          res.cookie("session", sessionId, { maxAge: 30 * 60 * 1000 });
          res.cookie("email", username, { maxAge: 30 * 60 * 1000 });
          res.cookie("department", "admin", { maxAge: 30 * 60 * 1000 });
          res.redirect("/home");
        } else {
          res.render("login", {
            errorMessage: "Invalid username or password",
          });
        }
      } else {
        res.render("login", { errorMessage: "Invalid username or password" });
      }
    } catch (error) {
      res.render("login", { errorMessage: error.message });
    }
  }
});

app.get("/hod-login", async (req, res) => {
  const query = req.url.slice(req.url.indexOf("?") + 1);
  const decodedQuery = querystring.parse(query);
  const message = decodedQuery.message;
  const departments = (await db.ref("departments").get()).val();
  res.render("hod-login", { errorMessage: message, departments });
});

app.post("/hod-login", async (req, res) => {
  const username = req.body.email;
  const password = req.body.password;
  const department = req.body.dept;
  const departments = (await db.ref("departments").get()).val();
  if (username != "" && password != "" && department != "0") {
    try {
      const hod = await db.ref("departments/" + department + "/hod").get();
      if (hod.val().email == username) {
        const isPasswordMatch = await bcrypt.compare(
          password,
          hod.val().password
        );
        if (isPasswordMatch) {
          const sessionId = uuidv4();
          await db.ref("departments/" + department + "/hod").update({
            lastLogin: new Date().toISOString(),
            session: sessionId,
          });
          res.cookie("session", sessionId, { maxAge: 30 * 60 * 1000 });
          res.cookie("email", username, { maxAge: 30 * 60 * 1000 });
          res.cookie("department", department, { maxAge: 30 * 60 * 1000 });
          res.redirect("/hod-home");
        } else {
          res.render("hod-login", {
            errorMessage: "Invalid username or password 1",
            departments,
          });
        }
      } else {
        res.render("hod-login", {
          errorMessage: "Invalid username or password",
          departments,
        });
      }
    } catch (error) {
      res.render("hod-login", { errorMessage: error.message, departments });
    }
  }
});

app.get("/logout", async (req, res) => {
  res.clearCookie("session");
  res.clearCookie("email");
  res.redirect("/");
});

app.get("/home", async (req, res) => {
  const session = req.cookies.session;
  const email = req.cookies.email;
  if (session && email) {
    const user = await db.ref("users/admin").get();
    if (
      user.val().session == session &&
      user.val().email == email &&
      user.val().usertype == "admin"
    ) {
      const departments = (await db.ref("departments").get()).val();
      let i = 0;
      for (e in departments) {
        if (departments[e].hod != "") i++;
      }
      const studentCount = (
        await _fire
          .collectionGroup("Students")
          .where("is_verified", "==", true)
          .count()
          .get()
      ).data();
      const pendingStudentCount = (
        await _fire
          .collectionGroup("Students")
          .where("is_verified", "==", false)
          .count()
          .get()
      ).data();
      const teachers = (
        await _fire.collectionGroup("Teachers").count().get()
      ).data();
      res.render("root/home", {
        userdata: user.val(),
        hodCount: i,
        departments,
        studentCount: studentCount["count"],
        pendingStudentCount: pendingStudentCount["count"],
        teacherCount: teachers["count"],
      });
    } else {
      res.redirect("/?message=Session expired. Please login again.");
    }
  } else {
    res.redirect("/");
  }
});

app.get("/hod-home", async (req, res) => {
  const session = req.cookies.session;
  const email = req.cookies.email;
  const department = req.cookies.department;
  if (session && email) {
    const departments = (await db.ref("departments").get()).val();
    const user = await db.ref("departments/" + department + "/hod").get();
    if (user.val().session == session && user.val().email == email) {
      const studentCount = (
        await _fire
          .collectionGroup("Students")
          .where("is_verified", "==", true)
          .where("department", "==", department)
          .count()
          .get()
      ).data();
      const pendingStudentCount = (
        await _fire
          .collectionGroup("Students")
          .where("is_verified", "==", false)
          .where("department", "==", department)
          .count()
          .get()
      ).data();
      const teachers = (
        await _fire
          .collectionGroup("Teachers")
          .where("dept", "==", department)
          .count()
          .get()
      ).data();
      res.render("hod/home", {
        userdata: user.val(),
        departments,
        studentCount: studentCount["count"],
        pendingStudentCount: pendingStudentCount["count"],
        teacherCount: teachers["count"],
      });
    } else {
      res.redirect("/hod-login?message=Session expired. Please login again.");
    }
  } else {
    res.redirect("/");
  }
});

app.get("/profile", async (req, res) => {
  const session = req.cookies.session;
  const email = req.cookies.email;
  if (session && email) {
    const user = await db.ref("users/admin").get();
    if (user.val().session == session && user.val().email == email) {
      res.render("root/profile", { userdata: user.val() });
    } else {
      res.redirect("/?message=Session expired. Please login again.");
    }
  } else {
    res.redirect("/");
  }
});

app.get("/hod-profile", async (req, res) => {
  const session = req.cookies.session;
  const email = req.cookies.email;
  const department = req.cookies.department;
  if (session && email) {
    const user = await db.ref("departments/" + department + "/hod").get();
    if (user.val().session == session && user.val().email == email) {
      res.render("root/profile", { userdata: user.val() });
    } else {
      res.redirect("/?message=Session expired. Please login again.");
    }
  } else {
    res.redirect("/");
  }
});

app.post("/save-address", async (req, res) => {
  const { address, city } = req.body;
  console.log("Address:", address);
  console.log("City:", city);

  if (req.body.userType == "admin") {
    await db
      .ref("users/admin")
      .update({
        address: address,
        city: city,
      })
      .then(() => {
        // Sending a response back to the client
        res.status(200).send({
          status: "success",
          message: "Address saved successfully",
        });
      });
  } else {
    db.ref("departments/" + req.cookies.department + "/hod")
      .update({
        address,
        city,
      })
      .then(() => {
        // Sending a response back to the client
        res.status(200).send({
          status: "success",
          message: "Address saved successfully",
        });
      });
  }
});

// Define route for uploading photo
app.post("/upload-photo", upload.single("profilePic"), (req, res) => {
  try {
    // Check if file was uploaded successfully
    if (!req.file) {
      throw new Error("No file uploaded.");
    }

    // Check file format
    const validFormats = ["image/jpeg", "image/png"];
    if (!validFormats.includes(req.file.mimetype)) {
      throw new Error("Invalid file format. Please upload a JPG or PNG image.");
    }

    // Upload file to Firebase storage (assuming Firebase admin SDK is initialized)
    const storage = admin.storage().bucket("smart-classroom-sgp.appspot.com");
    const imageRef = storage.file("images/" + req.file.originalname);
    const uploadTask = imageRef.save(req.file.buffer);
    uploadTask.then((snapshot) => {
      imageRef
        .getSignedUrl({
          action: "read",
          expires: "03-09-2491",
        })
        .then((urls) => {
          const downloadURL = urls[0];
          if (!downloadURL) throw new Error("Failed to upload photo.");
          if (req.body.userType == "admin") {
            db.ref("users/admin").update({
              profilePic: downloadURL,
            });
          } else {
            db.ref("departments/" + req.cookies.department + "/hod").update({
              profilePic: downloadURL,
            });
          }
          res.json({ message: "Photo uploaded successfully.", downloadURL });
        });
    });
  } catch (error) {
    console.error(error);
    res.status(200).json({ message: error.message });
  }
});

app.get("/settings", async (req, res) => {
  const session = req.cookies.session;
  const email = req.cookies.email;
  if (session && email) {
    const user = await db.ref("users/admin").get();
    if (user.val().session == session && user.val().email == email) {
      res.render("root/settings", { userdata: user.val() });
    } else {
      res.redirect("/?message=Session expired. Please login again.");
    }
  } else {
    res.redirect("/");
  }
});

app.get("/add-hod", async (req, res) => {
  const session = req.cookies.session;
  const email = req.cookies.email;
  if (session && email) {
    const user = await db.ref("users/admin").get();
    if (user.val().session == session && user.val().email == email) {
      res.render("root/add-hod", { userdata: user.val() });
    } else {
      res.redirect("/?message=Session expired. Please login again.");
    }
  } else {
    res.redirect("/");
  }
});

app.post("/api/departments", async (req, res) => {
  const { name } = req.body;
  try {
    await db.ref("departments").update({
      [name]: {
        hod: "",
        courses: [],
      },
    });
    res.status(200).send({
      status: "success",
      message: "Department added successfully",
    });
  } catch (error) {
    res.status(500).send({
      status: "error",
      message: error.message,
    });
  }
});

app.get("/api/departments", async (req, res) => {
  try {
    const departments = await db.ref("departments").get();
    res.status(200).send({
      status: "success",
      data: departments.val(),
    });
  } catch (error) {
    res.status(500).send({
      status: "error",
      message: error.message,
    });
  }
});

app.post("/api/remove-dept", async (req, res) => {
  const session = req.cookies.session;
  const email = req.cookies.email;
  if (session && email) {
    const user = await db.ref("users/admin").get();
    if (user.val().session == session && user.val().email == email) {
      const { department } = req.body;
      if (department != "0") {
        db.ref("departments/" + department)
          .remove()
          .then(() => {
            res.status(200).send({
              status: "success",
              message: "Dept Removed Successfully",
            });
          });
      } else {
        res.status(200).send({
          status: "error",
          message: "Select a department",
        });
      }
    } else {
      res.status(200).send({
        status: "error",
        message: "Session expired",
      });
    }
  } else {
    res.status(200).send({
      status: "error",
      message: "Session expired",
    });
  }
});

app.post("/api/add-hod", async (req, res) => {
  const session = req.cookies.session;
  const email = req.cookies.email;
  if (session && email) {
    const user = await db.ref("users/admin").get();
    if (user.val().session == session && user.val().email == email) {
      const { department, name, email, number, password } = req.body;
      if (
        department != "0" &&
        name != "" &&
        email != "" &&
        number != "" &&
        password != ""
      ) {
        if (number.length == 10 && emailRegex.test(email)) {
          const hod = await db.ref("departments/" + department + "/hod/").get();
          if (hod.val() == "") {
            const passHash = await bcrypt.hash(password, 10);
            db.ref("departments/" + department + "/hod/")
              .update({
                name,
                email,
                number,
                password: passHash,
                usertype: "hod",
                department,
              })
              .then(() => {
                // sendMail({
                //   from: "QR Attend <dragon724528@gmail.com>",
                //   to: email,
                //   subject: "Account Created",
                //   text: `Hello ${name}, your account has been created successfully. You can now login to the system using your email and password.`,
                // });
                res.status(200).send({
                  status: "success",
                  message: "HOD Added Successfully",
                });
              });
          } else {
            res.status(200).send({
              status: "error",
              message: "HOD already exits for this department",
            });
          }
        } else {
          res.status(200).send({
            status: "error",
            message: "Enter a valid email and password",
          });
        }
      } else {
        res.status(200).send({
          status: "error",
          message: "Fill all fields ",
        });
      }
    } else {
      res.status(200).send({
        status: "error",
        message: "Session expired",
      });
    }
  } else {
    res.status(200).send({
      status: "error",
      message: "Session expired",
    });
  }
});

app.post("/api/remove-hod", async (req, res) => {
  const session = req.cookies.session;
  const email = req.cookies.email;
  if (session && email) {
    const user = await db.ref("users/admin").get();
    if (user.val().session == session && user.val().email == email) {
      const { department } = req.body;
      if (department != "0") {
        db.ref("departments/" + department + "/hod/")
          .set("")
          .then(() => {
            res.status(200).send({
              status: "success",
              message: "HOD Removed Successfully",
            });
          });
      } else {
        res.status(200).send({
          status: "error",
          message: "Select a department",
        });
      }
    } else {
      res.status(200).send({
        status: "error",
        message: "Session expired",
      });
    }
  } else {
    res.status(200).send({
      status: "error",
      message: "Session expired",
    });
  }
});

app.get("/students", async (req, res) => {
  const session = req.cookies.session;
  const email = req.cookies.email;
  const department = req.cookies.department;
  if (session && email) {
    if (department == "admin") {
      const user = await db.ref("users/admin").get();
      if (user.val().session == session && user.val().email == email) {
        const departments = (await db.ref("departments").get()).val();
        const students = await _fire
          .collectionGroup("Students")
          .where("is_verified", "==", false)
          .get();
        res.render("root/students", {
          userdata: user.val(),
          departments,
          students: students.docs.map((doc) => doc.data()),
        });
      } else {
        res.redirect("/?message=Session expired. Please login again.");
      }
    } else {
      const user = await db.ref("departments/" + department + "/hod").get();
      if (user.val().session == session && user.val().email == email) {
        const students = await _fire
          .collectionGroup("Students")
          .where("is_verified", "==", false)
          .where("department", "==", department)
          .get();
        res.render("root/students", {
          userdata: user.val(),
          students: students.docs.map((doc) => doc.data()),
        });
      } else {
        res.redirect("/hod-login?message=Session expired. Please login again.");
      }
    }
  } else {
    res.redirect("/");
  }
});

app.post("/students", async (req, res) => {
  const session = req.cookies.session;
  const email = req.cookies.email;
  const department = req.cookies.department;
  const { dept, sem } = req.body;
  let semester = addOrdinalSuffix(sem);
  if (department == "admin") {
    if (dept == "all") {
      const students = await _fire
        .collection("sgp")
        .doc(semester)
        .collectionGroup("Students")
        .where("is_verified", "==", false)
        .get();
      res.send({ students: students.docs.map((doc) => doc.data()) });
    } else {
      const students = await _fire
        .collection("sgp")
        .doc(semester)
        .collection(dept)
        .doc("Student List")
        .collection("Students")
        .where("is_verified", "==", false)
        .get();
    }
    res.send({ students: students.docs.map((doc) => doc.data()) });
  } else {
    const students = await _fire
      .collection("sgp")
      .doc(semester)
      .collection(department)
      .doc("Student List")
      .collection("Students")
      .where("is_verified", "==", false)
      .get();
    res.send({ students: students.docs.map((doc) => doc.data()) });
  }
});

app.post("/api/verify-student", async (req, res) => {
  const session = req.cookies.session;
  const email = req.cookies.email;
  const department = req.cookies.department;
  if (session && email) {
    if (department == "admin") {
      const user = await db.ref("users/admin").get();
      if (user.val().session == session && user.val().email == email) {
        const { dept, semester, uid } = req.body;
        const student = await _fire
          .collection("sgp")
          .doc(semester)
          .collection(dept)
          .doc("Student List")
          .collection("Students")
          .doc(uid)
          .get();
        if (student.exists) {
          await _fire
            .collection("sgp")
            .doc(semester)
            .collection(dept)
            .doc("Student List")
            .collection("Students")
            .doc(uid)
            .update({
              is_verified: true,
            });
          res.status(200).send({
            status: "success",
            message: "Student verified successfully",
          });
        } else {
          res.status(200).send({
            status: "error",
            message: "Student not found",
          });
        }
      } else {
        res.status(200).send({
          status: "error",
          message: "Session expired",
        });
      }
    } else {
      const user = await db.ref("departments/" + department + "/hod").get();
      if (user.val().session == session && user.val().email == email) {
        console.log(req.body);
        const { dept, semester, uid } = req.body;
        console.log(semester, department, uid);
        const student = await _fire
          .collection("sgp")
          .doc(semester)
          .collection(department)
          .doc("Student List")
          .collection("Students")
          .doc(uid)
          .get();
        if (student.exists) {
          await _fire
            .collection("sgp")
            .doc(semester)
            .collection(department)
            .doc("Student List")
            .collection("Students")
            .doc(uid)
            .update({
              is_verified: true,
            });
          res.status(200).send({
            status: "success",
            message: "Student verified successfully",
          });
        } else {
          res.status(200).send({
            status: "error",
            message: "Student not found",
          });
        }
      }
    }
  }
});

app.post("/api/remove-student", async (req, res) => {
  const session = req.cookies.session;
  const email = req.cookies.email;
  const department = req.cookies.department;
  if (session && email) {
    if (department == "admin") {
      const user = await db.ref("users/admin").get();
      if (user.val().session == session && user.val().email == email) {
        const { dept, semester, uid } = req.body;
        const student = await _fire
          .collection("sgp")
          .doc(semester)
          .collection(dept)
          .doc("Student List")
          .collection("Students")
          .doc(uid)
          .get();
        if (student.exists) {
          await _fire
            .collection("sgp")
            .doc(semester)
            .collection(dept)
            .doc("Student List")
            .collection("Students")
            .doc(uid)
            .delete();
          res.status(200).send({
            status: "success",
            message: "Student removed successfully",
          });
        } else {
          res.status(200).send({
            status: "error",
            message: "Student not found",
          });
        }
      } else {
        res.status(200).send({
          status: "error",
          message: "Session expired",
        });
      }
    } else {
      const user = await db.ref("departments/" + department + "/hod").get();
      if (user.val().session == session && user.val().email == email) {
        const { dept, semester, uid } = req.body;
        const student = await _fire
          .collection("sgp")
          .doc(semester)
          .collection(department)
          .doc("Student List")
          .collection("Students")
          .doc(uid)
          .get();
        if (student.exists) {
          await _fire
            .collection("sgp")
            .doc(semester)
            .collection(department)
            .doc("Student List")
            .collection("Students")
            .doc(uid)
            .delete();
          res.status(200).send({
            status: "success",
            message: "Student removed successfully",
          });
        } else {
          res.status(200).send({
            status: "error",
            message: "Student not found",
          });
        }
      } else {
        res.status(200).send({
          status: "error",
          message: "Session expired",
        });
      }
    }
  } else {
    res.status(200).send({
      status: "error",
      message: "Session expired",
    });
  }
});

app.get("/students-list", async (req, res) => {
  const session = req.cookies.session;
  const email = req.cookies.email;
  const department = req.cookies.department;
  if (session && email) {
    if (department == "admin") {
      const user = await db.ref("users/admin").get();
      if (user.val().session == session && user.val().email == email) {
        const departments = (await db.ref("departments").get()).val();
        const students = await _fire
          .collectionGroup("Students")
          .where("is_verified", "==", true)
          .get();
        res.render("root/students-list", {
          userdata: user.val(),
          departments,
          students: students.docs.map((doc) => {
            const studentData = doc.data();
            studentData.email = studentData.email.replace(/(.{2}).+(@.+)/, "$1***$2");
            return studentData;
          }),
        });
      } else {
        res.redirect("/?message=Session expired. Please login again.");
      }
    } else {
      const user = await db.ref("departments/" + department + "/hod").get();
      if (user.val().session == session && user.val().email == email) {
        const students = await _fire
          .collectionGroup("Students")
          .where("is_verified", "==", true)
          .where("department", "==", department)
          .get();
        res.render("root/students-list", {
          userdata: user.val(),
          students: students.docs.map((doc) => {
            const studentData = doc.data();
            studentData.email = studentData.email.replace(/(.{2}).+(@.+)/, "$1***$2");
            return studentData;
          }),
        });
      } else {
        res.redirect("/hod-login?message=Session expired. Please login again.");
      }
    }
  } else {
    res.redirect("/");
  }
});

app.post("/students-list", async (req, res) => {
  const session = req.cookies.session;
  const email = req.cookies.email;
  const department = req.cookies.department;
  const { dept, sem } = req.body;
  let semester = addOrdinalSuffix(sem);
  if (department == "admin") {
    const students = await _fire
      .collection("sgp")
      .doc(semester)
      .collection(dept)
      .doc("Student List")
      .collection("Students")
      .where("is_verified", "==", true)
      .get();
    res.send({ students: students.docs.map((doc) => doc.data()) });
  } else {
    const students = await _fire
      .collection("sgp")
      .doc(semester)
      .collection(department)
      .doc("Student List")
      .collection("Students")
      .where("is_verified", "==", true)
      .get();
    res.send({ students: students.docs.map((doc) => doc.data()) });
  }
});

app.get("/pending-teachers", async (req, res) => {
  const session = req.cookies.session;
  const email = req.cookies.email;
  const department = req.cookies.department;
  if (session && email) {
    if (department == "admin") {
      const user = await db.ref("users/admin").get();
      if (user.val().session == session && user.val().email == email) {
        const departments = (await db.ref("departments").get()).val();
        const teachers = await _fire
          .collectionGroup("Teachers")
          .where("isVerified", "==", false)
          .get();
        res.render("root/pending-teachers", {
          userdata: user.val(),
          departments,
          teachers: teachers.docs.map((doc) => doc.data()),
        });
      } else {
        res.redirect("/?message=Session expired. Please login again.");
      }
    } else {
      const user = await db.ref("departments/" + department + "/hod").get();
      if (user.val().session == session && user.val().email == email) {
        const teachers = await _fire
          .collectionGroup("Teachers")
          .where("isVerified", "==", false)
          .where("dept", "==", department)
          .get();
        res.render("root/pending-teachers", {
          userdata: user.val(),
          teachers: teachers.docs.map((doc) => doc.data()),
        });
      } else {
        res.redirect("/hod-login?message=Session expired. Please login again.");
      }
    }
  } else {
    res.redirect("/");
  }
});

app.post("/teachers", async (req, res) => {
  const session = req.cookies.session;
  const email = req.cookies.email;
  const department = req.cookies.department;
  const { dept } = req.body;
  if (department == "admin") {
    const teachers = await _fire
      .collectionGroup("Teachers")
      .where("isVerified", "==", false)
      .get();
    console.log(teachers.docs.map((doc) => doc.data()));
    res.send({ teachers: teachers.docs.map((doc) => doc.data()) });
  } else {
    const teachers = await _fire
      .collectionGroup("Teachers")
      .where("isVerified", "==", false)
      .where("dept", "==", department)
      .get();
    res.send({ teachers: teachers.docs.map((doc) => doc.data()) });
  }
});

app.post("/api/verify-teacher", async (req, res) => {
  const session = req.cookies.session;
  const email = req.cookies.email;
  const department = req.cookies.department;
  if (session && email) {
    if (department == "admin") {
      const user = await db.ref("users/admin").get();
      if (user.val().session == session && user.val().email == email) {
        const { uid } = req.body;
        const teacher = await _fire
          .collection("sgp")
          .doc("Staff")
          .collection("Teachers")
          .doc(uid)
          .get();
        if (teacher.exists) {
          await _fire
            .collection("sgp")
            .doc("Staff")
            .collection("Teachers")
            .doc(uid)
            .update({
              isVerified: true,
            });
          res.status(200).send({
            status: "success",
            message: "Teacher verified successfully",
          });
        } else {
          res.status(200).send({
            status: "error",
            message: "Teacher not found",
          });
        }
      } else {
        res.status(200).send({
          status: "error",
          message: "Session expired",
        });
      }
    } else {
      const user = await db.ref("departments/" + department + "/hod").get();
      if (user.val().session == session && user.val().email == email) {
        const { uid } = req.body;
        const teacher = await _fire
          .collection("sgp")
          .doc("Staff")
          .collection("Teachers")
          .doc(uid)
          .get();
        if (teacher.exists) {
          await _fire
            .collection("sgp")
            .doc("Staff")
            .collection("Teachers")
            .doc(uid)
            .update({
              isVerified: true,
            });
          res.status(200).send({
            status: "success",
            message: "Teacher verified successfully",
          });
        } else {
          res.status(200).send({
            status: "error",
            message: "Teacher not found",
          });
        }
      }
    }
  }
});

app.get("/teachers-list", async (req, res) => {
  const session = req.cookies.session;
  const email = req.cookies.email;
  const department = req.cookies.department;
  if (session && email) {
    if (department == "admin") {
      const user = await db.ref("users/admin").get();
      if (user.val().session == session && user.val().email == email) {
        const departments = (await db.ref("departments").get()).val();
        const teachers = await _fire.collectionGroup("Teachers").get();
        res.render("root/teachers-list", {
          userdata: user.val(),
          departments,
          teachers: teachers.docs.map((doc) => doc.data()),
        });
      } else {
        res.redirect("/?message=Session expired. Please login again.");
      }
    } else {
      const user = await db.ref("departments/" + department + "/hod").get();
      if (user.val().session == session && user.val().email == email) {
        const teachers = await _fire
          .collectionGroup("Teachers")
          .where("isVerified", "==", true)
          .where("dept", "==", department)
          .get();
        res.render("root/teachers-list", {
          userdata: user.val(),
          teachers: teachers.docs.map((doc) => doc.data()),
        });
      } else {
        res.redirect("/hod-login?message=Session expired. Please login again.");
      }
    }
  } else {
    res.redirect("/");
  }
});

app.post("/teachers-list", async (req, res) => {
  const session = req.cookies.session;
  const email = req.cookies.email;
  const department = req.cookies.department;
  const { dept } = req.body;
  if (department == "admin") {
    const teachers = await _fire
      .collectionGroup("Teachers")
      .where("isVerified", "==", false)
      .get();
    res.send({ teachers: teachers.docs.map((doc) => doc.data()) });
  } else {
    const teachers = await _fire
      .collectionGroup("Teachers")
      .where("isVerified", "==", false)
      .where("dept", "==", department)
      .get();
    res.send({ teachers: teachers.docs.map((doc) => doc.data()) });
  }
});

app.post("/api/remove-teacher", async (req, res) => {
  const session = req.cookies.session;
  const email = req.cookies.email;
  const department = req.cookies.department;
  if (session && email) {
    if (department == "admin") {
      const user = await db.ref("users/admin").get();
      if (user.val().session == session && user.val().email == email) {
        const { uid } = req.body;
        const teacher = await _fire
          .collection("sgp")
          .doc("Staff")
          .collection("Teachers")
          .doc(uid)
          .get();
        if (teacher.exists) {
          await _fire
            .collection("sgp")
            .doc("Staff")
            .collection("Teachers")
            .doc(uid)
            .delete();
          res.status(200).send({
            status: "success",
            message: "Teacher removed successfully",
          });
        } else {
          res.status(200).send({
            status: "error",
            message: "Teacher not found",
          });
        }
      } else {
        res.status(200).send({
          status: "error",
          message: "Session expired",
        });
      }
    } else {
      const user = await db.ref("departments/" + department + "/hod").get();
      if (user.val().session == session && user.val().email == email) {
        const { uid } = req.body;
        const teacher = await _fire
          .collection("sgp")
          .doc("Staff")
          .collection("Teachers")
          .doc(uid)
          .get();
        if (teacher.exists) {
          await _fire
            .collection("sgp")
            .doc("Staff")
            .collection("Teachers")
            .doc(uid)
            .delete();
          res.status(200).send({
            status: "success",
            message: "Teacher removed successfully",
          });
        } else {
          res.status(200).send({
            status: "error",
            message: "Teacher not found",
          });
        }
      } else {
        res.status(200).send({
          status: "error",
          message: "Session expired",
        });
      }
    }
  }
});

app.get("/reports", async (req, res) => {
  const session = req.cookies.session;
  const email = req.cookies.email;
  const department = req.cookies.department;
  if (session && email) {
    if (department == "admin") {
      const user = await db.ref("users/admin").get();
      if (user.val().session == session && user.val().email == email) {
        const departments = (await db.ref("departments").get()).val();
        res.render("root/reports", {
          userdata: user.val(),
          departments,
        });
      } else {
        res.redirect("/?message=Session expired. Please login again.");
      }
    } else {
      const user = await db.ref("departments/" + department + "/hod").get();
      if (user.val().session == session && user.val().email == email) {
        const departments = (await db.ref("departments").get()).val();
        res.render("root/reports", {
          userdata: user.val(),
          departments,
        });
      } else {
        res.redirect("/hod-login?message=Session expired. Please login again.");
      }
    }
  } else {
    res.redirect("/");
  }
});

app.post("/api/getSubjects", async (req, res) => {
  const { dept, sem } = req.body;
  let semester = addOrdinalSuffix(sem);
  const subjects = await _fire
    .collection("sgp")
    .doc(semester)
    .collection(dept)
    .doc("Subject List")
    .collection("Subjects")
    .get();
  res.send({ subjects: subjects.docs.map((doc) => doc.id) });
});

app.post("/api/getAttendance", async (req, res) => {
  const { date, dept, sem, subject } = req.body;
  let semester = addOrdinalSuffix(sem);
  const attendance = await _fire
    .collection("sgp")
    .doc(semester)
    .collection(dept)
    .doc("Subject List")
    .collection("Subjects")
    .doc(subject)
    .collection("Attendance")
    .doc(date)
    .get();
  let attendanceList = [];
  if (attendance.exists) {
    let uid = Object.keys(attendance.data());
    await Promise.all(
      uid.map(async (id) => {
        const student = await _fire
          .collection("sgp")
          .doc(semester)
          .collection(dept)
          .doc("Student List")
          .collection("Students")
          .doc(id)
          .get();
        let st = {
          name: student.get("name"),
          email: student.get("email"),
          regNo: student.get("regNo"),
        };
        attendanceList.push(st);
      })
    );
  }
  res.send({ list: attendanceList });
});
