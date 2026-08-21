package com.movieverse;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * MovieVerse - Modern Full-Stack Movie Discovery Web Application
 * Main Spring Boot Application Entry Point.
 */
@SpringBootApplication
public class MovieVerseApplication {

    public static void main(String[] args) {
        SpringApplication.run(MovieVerseApplication.class, args);
        System.out.println("=================================================");
        System.out.println("  MovieVerse Spring Boot Application Started!   ");
        System.out.println("  Access URL: http://localhost:8080             ");
        System.out.println("  REST APIs:  http://localhost:8080/api/movies  ");
        System.out.println("=================================================");
    }
}
