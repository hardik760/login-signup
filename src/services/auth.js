
export const fakeLoginApi = (email, password) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (email === "admin@gmail.com" && password === "123456") {
          resolve({
            success: true,
            token: "fake-jwt-token",
          });
        } else {
          reject(new Error("Invalid email or password"));
        }
      }, 1000); 
    });
  };
  