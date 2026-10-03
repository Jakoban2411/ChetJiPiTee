cmake_minimum_required(VERSION 3.20)
project(HavocCity VERSION 2.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(HAVOC_BUILD_GAME "Build the Raylib 3D client" ON)
option(HAVOC_BUILD_TESTS "Build deterministic simulation tests" ON)

add_library(havoc_core src/core.cpp)
target_include_directories(havoc_core PUBLIC include)
target_compile_options(havoc_core PRIVATE -Wall -Wextra -Wpedantic)

if(HAVOC_BUILD_GAME)
  include(FetchContent)
  set(BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
  set(BUILD_GAMES OFF CACHE BOOL "" FORCE)
  FetchContent_Declare(raylib
    GIT_REPOSITORY https://github.com/raysan5/raylib.git
    GIT_TAG 5.5
    GIT_SHALLOW TRUE)
  FetchContent_MakeAvailable(raylib)
  add_executable(havoc_city src/main.cpp)
  target_link_libraries(havoc_city PRIVATE havoc_core raylib)
  target_compile_options(havoc_city PRIVATE -Wall -Wextra -Wpedantic)
endif()

if(HAVOC_BUILD_TESTS)
  enable_testing()
  add_executable(havoc_tests tests/core_tests.cpp)
  target_link_libraries(havoc_tests PRIVATE havoc_core)
  add_test(NAME havoc_simulation COMMAND havoc_tests)
endif()
